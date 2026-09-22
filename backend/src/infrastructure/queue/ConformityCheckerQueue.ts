import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import {
  runConformityCheck,
  confirmConformityCheck,
} from '../services/agents/conformity_checker_agent';
import {
  ConformityCheckInput,
  ConformityCheckOutput,
  ConfirmConformityCheckInput,
  ConfirmConformityCheckOutput,
} from '../services/agents/conformity_checker_agent/types';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
  calculateSizeInMB,
} from '../utils/redis-compression.util';
import { PrismaDosageAgentJobRepository } from '../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../repositories/Prisma';
import { DosageAgentJobState } from '../../domain/entities/DosageAgentJob';
import { DosageLoggerService } from '../services/dosage-logger.service';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';

const LOCK_DURATION_MS = 600_000; // 10 minuti (meno del dosage agent, è più veloce)
const LOCK_RENEW_TIME_MS = 120_000; // 2 minuti
const STALLED_INTERVAL_MS = 120_000; // 2 minuti

/**
 * Dati del job per il controllo di conformità
 */
export interface ConformityCheckerJobData {
  readonly input: ConformityCheckInput;
  readonly userId: string;
  readonly companyId?: string;
}

/**
 * Risultato del job di controllo conformità
 */
export type ConformityCheckerJobResult = ConformityCheckOutput;

const QUEUE_NAME = 'conformity-checker';

const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);

type ConformityCheckerJobReturnValue =
  | ConformityCheckerJobResult
  | CompressedData<ConformityCheckerJobResult>;

export class ConformityCheckerQueue {
  public readonly queue: Queue;
  public queueEvents: QueueEvents | null = null;
  public worker: Worker | null = null;
  private readonly activeJobTokens: Map<string, string>;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    this.queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[CONFORMITY-QUEUE] QueueEvents detected stalled job ${jobId}`);
    });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[CONFORMITY-QUEUE] QueueEvents ready'))
      .catch((error: unknown) => console.error('[CONFORMITY-QUEUE] QueueEvents error:', error));
    this.activeJobTokens = new Map();
  }

  /**
   * Aggiunge un job alla coda per il controllo di conformità
   */
  async addJob(data: ConformityCheckerJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[CONFORMITY-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('check-conformity', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(
      `[CONFORMITY-QUEUE] Job ${job.id} added to queue (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }

  /**
   * Ottiene lo stato di un job
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      jobGroupId: string;
      userId: string;
      notes?: string;
    };
    result?: ConformityCheckerJobResult;
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
    let result: ConformityCheckerJobResult | undefined;
    if (job.returnvalue) {
      const returnValue = job.returnvalue as ConformityCheckerJobReturnValue;
      if (typeof returnValue === 'object' && returnValue !== null) {
        if ('compressed' in returnValue && 'data' in returnValue) {
          result = decompressIfNeeded(returnValue as CompressedData<ConformityCheckerJobResult>);
        } else {
          result = returnValue as ConformityCheckerJobResult;
        }
      }
    }

    // Decomprime i dati originali per estrarre le info
    const jobData = job.data
      ? (decompressIfNeeded(job.data) as ConformityCheckerJobData)
      : undefined;

    return {
      id: job.id!,
      state,
      progress,
      data: jobData
        ? {
            jobGroupId: jobData.input?.jobGroupId ?? '',
            userId: jobData.userId,
            notes: jobData.input?.notes,
          }
        : undefined,
      result,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  /**
   * Rimuove un job dalla coda
   */
  async removeJob(jobId: string, force: boolean = false): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    if (state === 'active') {
      if (force) {
        const client = await this.queue.client;
        const prefix = this.queue.opts?.prefix ?? 'bull';
        const queueName = this.queue.name;
        const keys = {
          active: `${prefix}:${queueName}:active`,
          failed: `${prefix}:${queueName}:failed`,
          jobKey: `${prefix}:${queueName}:${jobId}`,
        };
        await client.lrem(keys.active, 0, jobId);
        const timestamp = Date.now();
        await client.zadd(keys.failed, timestamp, jobId);
        await client.hset(keys.jobKey, 'failedReason', 'Job cancelled by user (force)');
        await client.hset(keys.jobKey, 'finishedOn', timestamp.toString());
        try {
          await dosageAgentJobRepository.updateStatus({
            jobId,
            state: DosageAgentJobState.FAILED,
            failedReason: 'Job cancelled by user (force)',
            finishedOn: new Date(timestamp),
          });
          console.log(
            `[CONFORMITY-QUEUE] Job ${jobId} force-cancelled via Redis and DB updated to FAILED`,
          );
        } catch (dbError) {
          console.warn(
            `[CONFORMITY-QUEUE] Job ${jobId} force-cancelled but DB update failed:`,
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
      try {
        const existingJob = await dosageAgentJobRepository.findById(jobId);
        if (existingJob) {
          await dosageAgentJobRepository.updateStatus({
            jobId,
            state: DosageAgentJobState.FAILED,
            failedReason: 'Job removed by user',
            finishedOn: new Date(),
          });
        }
      } catch {
        // Ignore DB errors for non-active jobs
      }
      console.log(`[CONFORMITY-QUEUE] Job ${jobId} removed (was ${state})`);
    }
  }

  /**
   * Avvia il worker per processare i job
   */
  startWorker(): void {
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

  /**
   * Ferma il worker
   */
  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[CONFORMITY-QUEUE] Worker stopped');
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
      console.log('[CONFORMITY-QUEUE] QueueEvents stopped');
    }
  }

  /**
   * Chiude la coda
   */
  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

let queueInstance: ConformityCheckerQueue | null = null;

/**
 * Ottiene l'istanza singleton della coda
 */
export function getConformityCheckerQueue(): ConformityCheckerQueue {
  if (!queueInstance) {
    queueInstance = new ConformityCheckerQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}

/**
 * Conferma le proposte di conformità (sincrono)
 */
export async function confirmConformityProposals(
  input: ConfirmConformityCheckInput,
): Promise<ConfirmConformityCheckOutput> {
  return confirmConformityCheck(input);
}
