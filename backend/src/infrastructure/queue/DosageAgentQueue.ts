import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import {
  runFlowsMultiCompany,
  InputDosageAgent,
  expandUnitOfProductionWithCycles,
  groupUnitsByCompany,
  RawUnitOfProduction,
} from '../services/agents/dosage_agent';
import {
  UnitAllowedProductsOutput,
  UnitAllowedProductsWithDosageOutput,
} from '../services/agents/dosage_agent/flowMatchCropTreatment';
import { StockBalanceReport } from '../services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
  calculateSizeInMB,
} from '../utils/redis-compression.util';
import { DosageLoggerService } from '../services/dosage-logger.service';
import { PrismaDosageAgentJobRepository } from '../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../repositories/Prisma';
import { DosageAgentJobState } from '../../domain/entities/DosageAgentJob';
import {
  DosageJobResultStorageService,
  StoredJobResultReference,
} from '../services/dosage-job-result-storage.service';
import { LlmUsageLogger } from '../services/llm_costs/llm-usage-logger';
import { DeductUserCreditsUseCase } from '../../application/use-cases/user/DeductUserCreditsUseCase';
import { PrismaUserRepository } from '../repositories/PrismaUserRepository';
import { LlmJobType } from '@prisma/client';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';

const LOCK_DURATION_MS = 1_800_000; // 30 minuti
const LOCK_RENEW_TIME_MS = 240_000; // 4 minuti
const STALLED_INTERVAL_MS = 240_000; // 4 minuti

export interface DosageAgentJobData {
  input: InputDosageAgent;
  userId: string;
}

export interface DosageAgentJobResult {
  outcome: ReadonlyArray<UnitAllowedProductsOutput>;
  outcomeWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  stockBalance: StockBalanceReport;
}

export interface ExternalDosageAgentJobResult {
  readonly externalResult: StoredJobResultReference;
  readonly outcomeCount: number;
  readonly outcomeWithDosageCount: number;
  readonly stockBalanceProductsCount: number;
}

const QUEUE_NAME = 'dosage-agent';

const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);

type DosageAgentJobReturnValue =
  | DosageAgentJobResult
  | CompressedData<DosageAgentJobResult>
  | ExternalDosageAgentJobResult;

export class DosageAgentQueue {
  public readonly queue: Queue;
  public queueEvents: QueueEvents | null = null;
  public worker: Worker | null = null;
  private readonly activeJobTokens: Map<string, string>;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    this.queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[DOSAGE-QUEUE] QueueEvents detected stalled job ${jobId}`);
    });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[DOSAGE-QUEUE] QueueEvents ready'))
      .catch((error: unknown) => console.error('[DOSAGE-QUEUE] QueueEvents error:', error));
    this.activeJobTokens = new Map();
  }

  async addJob(data: DosageAgentJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[DOSAGE-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('calculate-dosage', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(
      `[DOSAGE-QUEUE] Job ${job.id} added to queue (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      productsCount: number;
      unitsCount: number;
      unitsProcessed?: number;
      userId: string;
    };
    result?: DosageAgentJobResult;
    resultUrl?: string;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    const progress = job.progress as number;

    // Decomprime il risultato se era stato compresso
    let result: DosageAgentJobResult | undefined;
    let resultUrl: string | undefined;
    let unitsProcessedFromResult: number | undefined;
    if (job.returnvalue) {
      const returnValue = job.returnvalue as DosageAgentJobReturnValue;
      if (typeof returnValue === 'object' && returnValue !== null) {
        if ('externalResult' in returnValue) {
          resultUrl = returnValue.externalResult.url;
          // For external results, we have the count stored
          unitsProcessedFromResult = (returnValue as ExternalDosageAgentJobResult)
            .outcomeWithDosageCount;
        } else if ('compressed' in returnValue && 'data' in returnValue) {
          result = decompressIfNeeded(returnValue as CompressedData<DosageAgentJobResult>);
          unitsProcessedFromResult = result.outcomeWithDosage?.length;
        } else {
          result = returnValue as DosageAgentJobResult;
          unitsProcessedFromResult = result.outcomeWithDosage?.length;
        }
      }
    }

    const originalUnitsCount = job.data?.input?.unitOfProduction?.length ?? 0;
    // Use processed units count from result if available, otherwise use original input
    const effectiveUnitsCount = unitsProcessedFromResult ?? originalUnitsCount;

    return {
      id: job.id!,
      state,
      progress,
      data: job.data
        ? {
            productsCount: job.data.input?.products?.length ?? 0,
            // When job is completed, show the actual processed units count
            unitsCount: effectiveUnitsCount,
            // Also provide the original count for reference when different from processed
            unitsProcessed:
              unitsProcessedFromResult !== undefined &&
              unitsProcessedFromResult !== originalUnitsCount
                ? unitsProcessedFromResult
                : undefined,
            userId: job.data.userId,
          }
        : undefined,
      result,
      resultUrl,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  async removeJob(jobId: string, force: boolean = false): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    // If job is active (running), we need special handling
    if (state === 'active') {
      if (force) {
        // Force removal of active jobs using script execution
        // This bypasses the lock mechanism by directly manipulating Redis
        const client = await this.queue.client;
        const prefix = this.queue.opts?.prefix ?? 'bull';
        const queueName = this.queue.name;
        const keys = {
          active: `${prefix}:${queueName}:active`,
          failed: `${prefix}:${queueName}:failed`,
          jobKey: `${prefix}:${queueName}:${jobId}`,
        };
        // Remove from active list
        await client.lrem(keys.active, 0, jobId);
        // Add to failed set with timestamp
        const timestamp = Date.now();
        await client.zadd(keys.failed, timestamp, jobId);
        // Update job state in hash
        await client.hset(keys.jobKey, 'failedReason', 'Job cancelled by user (force)');
        await client.hset(keys.jobKey, 'finishedOn', timestamp.toString());
        // Update DosageAgentJob in database to FAILED
        try {
          const dosageJobRepository = new PrismaDosageAgentJobRepository(prisma);
          await dosageJobRepository.updateStatus({
            jobId,
            state: DosageAgentJobState.FAILED,
            failedReason: 'Job cancelled by user (force)',
            finishedOn: new Date(timestamp),
          });
          console.log(
            `[DOSAGE-QUEUE] Job ${jobId} force-cancelled via Redis and DB updated to FAILED`,
          );
        } catch (dbError) {
          // Log but don't fail - the Redis operation was successful
          console.warn(
            `[DOSAGE-QUEUE] Job ${jobId} force-cancelled but DB update failed:`,
            dbError,
          );
        }
      } else {
        throw new Error(
          `Job ${jobId} is currently running. Use force=true to cancel it, or wait for it to complete.`,
        );
      }
    } else {
      await job.remove();
      // Also update DB state if job exists there
      try {
        const dosageJobRepository = new PrismaDosageAgentJobRepository(prisma);
        const existingJob = await dosageJobRepository.findById(jobId);
        if (existingJob) {
          await dosageJobRepository.updateStatus({
            jobId,
            state: DosageAgentJobState.FAILED,
            failedReason: 'Job removed by user',
            finishedOn: new Date(),
          });
        }
      } catch {
        // Ignore DB errors for non-active jobs
      }
      console.log(`[DOSAGE-QUEUE] Job ${jobId} removed (was ${state})`);
    }
  }

  async removeJobs(
    jobIds: string[],
    force: boolean = false,
  ): Promise<{ removedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let removedCount = 0;
    await Promise.allSettled(
      jobIds.map(async (jobId) => {
        try {
          await this.removeJob(jobId, force);
          removedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`${jobId}: ${errorMessage}`);
        }
      }),
    );
    return { removedCount, errors };
  }

  startWorker(): void {
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

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[DOSAGE-QUEUE] Worker stopped');
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
      console.log('[DOSAGE-QUEUE] QueueEvents stopped');
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }

  private async deductCreditsForJob(jobId: string, userId: string): Promise<void> {
    try {
      // Flush pending usage records to ensure all are saved
      const usageLogger = LlmUsageLogger.getInstance();
      await usageLogger.flush();

      // Wait a bit to ensure all records are persisted
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get all usage records for this job (by jobId or jobGroupId)
      const usages = await prisma.llmUsage.findMany({
        where: {
          userId,
          jobType: LlmJobType.DOSAGE,
          OR: [{ jobId }, { jobGroupId: jobId }],
        },
      });

      if (usages.length === 0) {
        console.log(
          `[DOSAGE-QUEUE] No LLM usage found for job ${jobId}, skipping credit deduction`,
        );
        return;
      }

      // Calculate total cost
      const totalCost = usages.reduce((sum, usage) => sum + usage.costClient, 0);

      if (totalCost <= 0) {
        console.log(
          `[DOSAGE-QUEUE] Total cost for job ${jobId} is ${totalCost}, skipping credit deduction`,
        );
        return;
      }

      // Deduct credits
      const userRepository = new PrismaUserRepository(prisma);
      const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
      await deductCreditsUseCase.execute({
        userId,
        amount: totalCost,
      });

      console.log(
        `[DOSAGE-QUEUE] Deducted ${totalCost} credits from user ${userId} for job ${jobId} (${usages.length} usage records)`,
      );
    } catch (error) {
      console.error(
        `[DOSAGE-QUEUE] Failed to deduct credits for job ${jobId}:`,
        error instanceof Error ? error.message : String(error),
      );
      // Don't throw - we don't want to fail the job if credit deduction fails
      // The usage is already logged, so we can retry the deduction later if needed
    }
  }

  private async handleLockRenewalFailure(jobIds: string[]): Promise<void> {
    await Promise.allSettled(
      jobIds.map(async (jobId) => {
        try {
          const job = await this.queue.getJob(jobId);
          if (!job) {
            console.error(`[DOSAGE-QUEUE] Unable to fetch job ${jobId} after lock renewal failure`);
            return;
          }
          const lockToken = this.activeJobTokens.get(jobId) ?? job.token ?? '';
          const errorMessage = `Lock renewal failed after ${LOCK_DURATION_MS}ms for job ${jobId}`;
          const error = new Error(errorMessage);
          error.name = 'LockRenewalFailedError';
          if (lockToken) {
            await job.moveToFailed(error, lockToken);
            console.error(`[DOSAGE-QUEUE] Job ${jobId} moved to failed due to lock issue`);
          } else {
            await job.log(`[LOCK-RENEWAL] ${errorMessage}`);
            job.failedReason = errorMessage;
            console.error(
              `[DOSAGE-QUEUE] Missing lock token for job ${jobId}; recorded failure reason for visibility`,
            );
          }
          this.activeJobTokens.delete(jobId);
        } catch (err) {
          console.error(`[DOSAGE-QUEUE] Error handling lock failure for job ${jobId}:`, err);
        }
      }),
    );
  }
}

let queueInstance: DosageAgentQueue | null = null;

export function getDosageAgentQueue(): DosageAgentQueue {
  if (!queueInstance) {
    queueInstance = new DosageAgentQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}
