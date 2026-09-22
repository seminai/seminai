import { Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { runConformityCheck } from '../services/agents/conformity_checker_agent';
import { compressIfNeeded, decompressIfNeeded, CompressedData, calculateSizeInMB } from '../utils/redis-compression.util';
import { prisma } from '../repositories/Prisma';
import { DosageAgentJobState } from '../../domain/entities/DosageAgentJob';
import { DosageLoggerService } from '../services/dosage-logger.service';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';
import { LOCK_DURATION_MS, LOCK_RENEW_TIME_MS, STALLED_INTERVAL_MS, ConformityCheckerJobData, QUEUE_NAME, dosageAgentJobRepository } from './conformity-checker-queue.support';
import type { ConformityCheckerQueueContext } from './conformity-checker-queue.context';

export function conformityCheckerQueueStartWorker(this: ConformityCheckerQueueContext): void {
    if (this.worker) {
      console.log('[CONFORMITY-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<ConformityCheckerJobData>>) => {
        console.log(`[CONFORMITY-QUEUE] Processing job ${job.id}`);
        try {
          await job.updateProgress(0);
          const jobData = decompressIfNeeded(job.data);
          console.log(`[CONFORMITY-QUEUE] Job data decompressed`);
          console.log(
            `[CONFORMITY-QUEUE] Starting conformity check for user ${jobData.userId}, jobGroupId: ${jobData.input.jobGroupId}`,
          );

          const userExists = await ensureUserOrSkip(jobData.userId, prisma, {
            jobId: job.id,
            queueName: QUEUE_NAME,
          });
          if (!userExists) {
            return skippedJobResult(`user ${jobData.userId} no longer exists`);
          }

          // Aggiorna stato a ACTIVE
          try {
            await dosageAgentJobRepository.updateStatus({
              jobId: job.id ? String(job.id) : '',
              userId: jobData.userId,
              state: DosageAgentJobState.ACTIVE,
              progress: 0,
              failedReason: null,
              processedOn: new Date(),
              finishedOn: null,
              name: `Controllo Conformità - ${jobData.input.jobGroupId}`,
            });
          } catch (error) {
            console.error(
              `[CONFORMITY-QUEUE] Failed to persist ACTIVE status for job ${job.id}:`,
              error,
            );
          }

          await job.updateProgress(10);

          // Crea il contesto per il logging
          const context = {
            jobId: job.id ? String(job.id) : '',
            userId: jobData.userId,
            companyId: jobData.companyId,
          };

          // Log iniziale
          const logger = DosageLoggerService.getInstance();
          logger.logInfo({
            jobId: context.jobId,
            userId: context.userId,
            message: `Avvio controllo conformità`,
            metadata: {
              jobGroupId: jobData.input.jobGroupId,
              hasNotes: Boolean(jobData.input.notes),
            },
          });

          // Esegue il controllo di conformità
          const result = await runConformityCheck(jobData.input, context);

          await job.updateProgress(100);
          console.log(
            `[CONFORMITY-QUEUE] Job ${job.id} completed successfully: ${result.summary.totalJobs} jobs checked`,
          );

          // Aggiorna stato a COMPLETED
          try {
            await dosageAgentJobRepository.updateStatus({
              jobId: job.id ? String(job.id) : '',
              userId: jobData.userId,
              state: DosageAgentJobState.COMPLETED,
              progress: 100,
              failedReason: null,
              finishedOn: new Date(),
            });
          } catch (error) {
            console.error(
              `[CONFORMITY-QUEUE] Failed to persist COMPLETED status for job ${job.id}:`,
              error,
            );
          }

          // Log completamento
          logger.logCompletion({
            jobId: context.jobId,
            userId: context.userId,
            message: `Controllo conformità completato: ${result.summary.conformJobs} conformi, ${result.summary.nonConformJobs} non conformi su ${result.summary.totalJobs} interventi`,
            metadata: {
              jobGroupId: jobData.input.jobGroupId,
              conformJobs: result.summary.conformJobs,
              nonConformJobs: result.summary.nonConformJobs,
              jobsToExclude: result.summary.jobsToExclude,
            },
          });

          // Comprimi il risultato se necessario
          const resultSize = calculateSizeInMB(result);
          console.log(`[CONFORMITY-QUEUE] Job ${job.id} result size: ${resultSize.toFixed(2)}MB`);
          const compressedResult = compressIfNeeded(result);
          return compressedResult;
        } catch (error) {
          console.error(`[CONFORMITY-QUEUE] Job ${job.id} failed:`, error);
          try {
            const errorJobData = decompressIfNeeded(job.data);
            const errorContext = {
              jobId: job.id ? String(job.id) : '',
              userId: errorJobData.userId,
            };
            const errorLogger = DosageLoggerService.getInstance();
            errorLogger.logError({
              jobId: errorContext.jobId,
              userId: errorContext.userId,
              message: `Conformity check failed: ${error instanceof Error ? error.message : String(error)}`,
              error: error instanceof Error ? error : undefined,
              metadata: {
                jobGroupId: errorJobData.input?.jobGroupId,
              },
            });
            await dosageAgentJobRepository.updateStatus({
              jobId: errorContext.jobId,
              userId: errorContext.userId,
              state: DosageAgentJobState.FAILED,
              progress: 0,
              failedReason: error instanceof Error ? error.message : String(error),
              finishedOn: new Date(),
            });
          } catch (persistError) {
            console.error(
              `[CONFORMITY-QUEUE] Failed to persist FAILED status for job ${job.id}:`,
              persistError,
            );
          }
          throw error;
        }
      },
      {
        connection,
        concurrency: 2, // Può essere un po' più parallelo del dosage agent
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
      console.log(`[CONFORMITY-QUEUE] Job ${job.id} completed`);
      if (job?.id) {
        this.activeJobTokens.delete(job.id);
      }
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[CONFORMITY-QUEUE] Job ${job?.id} failed with error:`, err);
      if (job?.id) {
        this.activeJobTokens.delete(job.id);
      }
    });
    console.log('[CONFORMITY-QUEUE] Worker started');
  }
