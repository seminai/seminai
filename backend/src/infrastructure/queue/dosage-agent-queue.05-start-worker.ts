import { Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { runFlowsMultiCompany, expandUnitOfProductionWithCycles, groupUnitsByCompany, RawUnitOfProduction } from '../services/agents/dosage_agent';
import { StockBalanceReport } from '../services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { compressIfNeeded, decompressIfNeeded, CompressedData, calculateSizeInMB } from '../utils/redis-compression.util';
import { DosageLoggerService } from '../services/dosage-logger.service';
import { prisma } from '../repositories/Prisma';
import { DosageAgentJobState } from '../../domain/entities/DosageAgentJob';
import { DosageJobResultStorageService } from '../services/dosage-job-result-storage.service';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';
import { LOCK_DURATION_MS, LOCK_RENEW_TIME_MS, STALLED_INTERVAL_MS, DosageAgentJobData, ExternalDosageAgentJobResult, QUEUE_NAME, dosageAgentJobRepository } from './dosage-agent-queue.support';
import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export function dosageAgentQueueStartWorker(this: DosageAgentQueueContext): void {
    if (this.worker) {
      console.log('[DOSAGE-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    const resultStorageService = new DosageJobResultStorageService();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<DosageAgentJobData>>) => {
        console.log(`[DOSAGE-QUEUE] Processing job ${job.id}`);
        try {
          await job.updateProgress(0);
          const jobData = decompressIfNeeded(job.data);
          console.log(`[DOSAGE-QUEUE] Job data decompressed`);
          console.log(`[DOSAGE-QUEUE] Starting dosage calculation for user ${jobData.userId}`);

          const userExists = await ensureUserOrSkip(jobData.userId, prisma, {
            jobId: job.id,
            queueName: QUEUE_NAME,
          });
          if (!userExists) {
            return skippedJobResult(`user ${jobData.userId} no longer exists`);
          }

          // Usa runFlowsMultiCompany per dividere per azienda
          // Prima calcoliamo quante aziende ci sono per impostare il nome iniziale
          const expandedUnits = await expandUnitOfProductionWithCycles(
            jobData.input.unitOfProduction as RawUnitOfProduction[],
          );
          const companyMap = await groupUnitsByCompany(expandedUnits);
          const totalCompanies = companyMap.size;

          // Imposta il nome iniziale del job principale se ci sono più aziende
          const initialJobName =
            totalCompanies > 1
              ? `Pianificazione Dosaggi - 0 su ${totalCompanies} aziende`
              : 'Pianificazione Dosaggi';

          try {
            await dosageAgentJobRepository.updateStatus({
              jobId: job.id ? String(job.id) : '',
              userId: jobData.userId,
              state: DosageAgentJobState.ACTIVE,
              progress: 0,
              failedReason: null,
              processedOn: new Date(),
              finishedOn: null,
              name: initialJobName,
            });
          } catch (error) {
            console.error(
              `[DOSAGE-QUEUE] Failed to persist ACTIVE status for job ${job.id}:`,
              error,
            );
          }

          const multiCompanyResult = await runFlowsMultiCompany(jobData.input, {
            queueJobId: job.id ? String(job.id) : undefined,
            userId: jobData.userId,
          });

          const mainJobId = job.id ? String(job.id) : '';
          const isSingleCompany = multiCompanyResult.jobs.length === 1;

          // Aggiorna lo stato di tutti i job creati
          for (const companyResult of multiCompanyResult.jobs) {
            try {
              await dosageAgentJobRepository.updateStatus({
                jobId: companyResult.jobId,
                userId: jobData.userId,
                state: DosageAgentJobState.COMPLETED,
                progress: 100,
                failedReason: null,
                finishedOn: new Date(),
              });
            } catch (error) {
              console.error(
                `[DOSAGE-QUEUE] Failed to persist COMPLETED status for job ${companyResult.jobId}:`,
                error,
              );
            }

            // Log completamento tramite Socket.IO per ogni azienda
            const logger = DosageLoggerService.getInstance();
            logger.logCompletion({
              jobId: companyResult.jobId,
              userId: jobData.userId,
              message: `Elaborazione completata per ${companyResult.companyName}: ${companyResult.outcome.length} unità, ${companyResult.outcome.reduce((sum, u) => sum + (u.products?.length || 0), 0)} prodotti`,
              metadata: {
                companyId: companyResult.companyId,
                companyName: companyResult.companyName,
                unitsProcessed: companyResult.outcome.length,
                totalProducts: companyResult.outcome.reduce(
                  (sum, u) => sum + (u.products?.length || 0),
                  0,
                ),
              },
            });
          }

          await job.updateProgress(100);
          console.log(
            `[DOSAGE-QUEUE] Job ${job.id} completed successfully: ${multiCompanyResult.jobs.length} companies processed`,
          );

          // Deduct credits for all LLM usage during this job
          await this.deductCreditsForJob(mainJobId, jobData.userId);

          // Aggiorna il job principale solo se ci sono più aziende (altrimenti è già stato aggiornato nel loop)
          if (job.id && !isSingleCompany) {
            try {
              await dosageAgentJobRepository.updateStatus({
                jobId: mainJobId,
                userId: jobData.userId,
                state: DosageAgentJobState.COMPLETED,
                progress: 100,
                failedReason: null,
                finishedOn: new Date(),
              });
            } catch (error) {
              console.error(
                `[DOSAGE-QUEUE] Failed to persist COMPLETED status for main job ${job.id}:`,
                error,
              );
            }
          }

          // Combina i risultati per compatibilità con il formato originale
          // (per mantenere compatibilità con il codice esistente)
          const combinedResult = {
            outcome: multiCompanyResult.jobs.flatMap((j) => j.outcome),
            outcomeWithDosage: multiCompanyResult.jobs.flatMap((j) => j.outcomeWithDosage),
            stockBalance: multiCompanyResult.jobs.reduce<StockBalanceReport>(
              (acc, j) => {
                return {
                  timestamp: j.stockBalance.timestamp,
                  totalProducts: acc.totalProducts + j.stockBalance.totalProducts,
                  productsOverused: acc.productsOverused + j.stockBalance.productsOverused,
                  productsWithinLimit: acc.productsWithinLimit + j.stockBalance.productsWithinLimit,
                  products: [...acc.products, ...j.stockBalance.products],
                };
              },
              {
                timestamp: new Date(),
                totalProducts: 0,
                productsOverused: 0,
                productsWithinLimit: 0,
                products: [],
              },
            ),
          };

          const resultSize = calculateSizeInMB(combinedResult);
          const jsonString = JSON.stringify(combinedResult);
          const uncompressedBytes = Buffer.byteLength(jsonString, 'utf8');
          const uncompressedMb = uncompressedBytes / 1024 / 1024;
          console.log(`[DOSAGE-QUEUE] Job ${job.id} result size: ${resultSize.toFixed(2)}MB`);
          const compressedResult = compressIfNeeded(combinedResult);
          if (compressedResult.compressed) {
            const base64PayloadBytes = Buffer.byteLength(String(compressedResult.data), 'utf8');
            const base64PayloadMb = base64PayloadBytes / 1024 / 1024;
            console.log(
              `[DOSAGE-QUEUE] Job ${job.id} compressed payload size: ${base64PayloadMb.toFixed(2)}MB`,
            );
            const MAX_SAFE_UPSTASH_REQUEST_MB = 8.5;
            if (base64PayloadMb <= MAX_SAFE_UPSTASH_REQUEST_MB) {
              return compressedResult;
            }
          } else {
            const MAX_SAFE_UPSTASH_REQUEST_MB = 8.5;
            if (uncompressedMb <= MAX_SAFE_UPSTASH_REQUEST_MB) {
              return compressedResult;
            }
          }
          console.warn(
            `[DOSAGE-QUEUE] Job ${job.id} result too large for Upstash request limit; storing externally`,
          );
          const stored = await resultStorageService.storeJsonResult({
            userId: jobData.userId,
            jobId: job.id ? String(job.id) : 'unknown',
            json: jsonString,
          });
          return {
            externalResult: stored,
            outcomeCount: combinedResult.outcome.length,
            outcomeWithDosageCount: combinedResult.outcomeWithDosage.length,
            stockBalanceProductsCount: combinedResult.stockBalance.products.length,
          } satisfies ExternalDosageAgentJobResult;
        } catch (error) {
          console.error(`[DOSAGE-QUEUE] Job ${job.id} failed:`, error);
          try {
            // Extract userId from job data for error persistence
            const errorJobData = decompressIfNeeded(job.data);
            await dosageAgentJobRepository.updateStatus({
              jobId: job.id ? String(job.id) : '',
              userId: errorJobData.userId,
              state: DosageAgentJobState.FAILED,
              progress: 0,
              failedReason: error instanceof Error ? error.message : String(error),
              finishedOn: new Date(),
            });
          } catch (persistError) {
            console.error(
              `[DOSAGE-QUEUE] Failed to persist FAILED status for job ${job.id}:`,
              persistError,
            );
          }
          throw error;
        }
      },
      {
        connection,
        concurrency: 1,
        lockDuration: LOCK_DURATION_MS,
        lockRenewTime: LOCK_RENEW_TIME_MS,
        stalledInterval: STALLED_INTERVAL_MS,
        maxStalledCount: 2,
      },
    );
    this.worker.on('active', (job) => {
      if (job.id && job.token) {
        this.activeJobTokens.set(job.id, job.token);
      }
    });
    this.worker.on('completed', (job) => {
      console.log(`[DOSAGE-QUEUE] Job ${job.id} completed`);
      if (job?.id) {
        this.activeJobTokens.delete(job.id);
      }
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[DOSAGE-QUEUE] Job ${job?.id} failed with error:`, err);
      if (job?.id) {
        this.activeJobTokens.delete(job.id);
      }
    });
    this.worker.on('lockRenewalFailed', (jobIds) => {
      console.error('[DOSAGE-QUEUE] Lock renewal failed for jobs:', jobIds);
      void this.handleLockRenewalFailure(jobIds);
    });
    this.worker.on('locksRenewed', (data) => {
      console.log(`[DOSAGE-QUEUE] Locks renewed for ${data.count} job(s)`);
    });
    console.log('[DOSAGE-QUEUE] Worker started');
  }
