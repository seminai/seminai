import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
  calculateSizeInMB,
} from '../utils/redis-compression.util';
import {
  ExtractFromFileUseCase,
  type ExtractionResult,
  type ExtractionPhase,
} from '../../application/use-cases/onboarding/ExtractFromFileUseCase';
import { getGlobalSocketIO } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import { prisma } from '../repositories/Prisma';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';

const QUEUE_NAME = 'onboarding-extraction';
const LOCK_DURATION_MS = 1_200_000; // 20 min
const LOCK_RENEW_TIME_MS = 180_000; // 3 min
const STALLED_INTERVAL_MS = 180_000; // 3 min
const JOB_TIMEOUT_MS = 900_000; // 15 min

export interface OnboardingExtractionJobData {
  fileBuffer: Buffer | { type: 'Buffer'; data: number[] };
  originalName: string;
  mimeType: string;
  userId: string;
}

export interface OnboardingExtractionJobResult extends ExtractionResult {
  status: 'completed' | 'failed';
}

export interface OnboardingExtractionProgress {
  readonly version: 1;
  readonly phase: ExtractionPhase;
  readonly progress: number;
  readonly message: string;
  readonly updatedAt: string;
}

function emitSocketProgress(jobId: string, payload: OnboardingExtractionProgress): void {
  const io = getGlobalSocketIO();
  if (!io) return;
  const room = `job:${jobId}`;
  io.to(room).emit('extraction:progress', payload);
}

function emitSocketCompleted(jobId: string): void {
  const io = getGlobalSocketIO();
  if (!io) return;
  io.to(`job:${jobId}`).emit('extraction:completed', {
    version: 1,
    jobId,
    resultReady: true,
  });
}

function emitSocketFailed(jobId: string, errorCode: string, message: string): void {
  const io = getGlobalSocketIO();
  if (!io) return;
  io.to(`job:${jobId}`).emit('extraction:failed', {
    version: 1,
    jobId,
    errorCode,
    message,
  });
}

export class OnboardingExtractionQueue {
  public readonly queue: Queue;
  public queueEvents: QueueEvents | null = null;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    this.queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[ONBOARDING-QUEUE] Stalled job ${jobId}`);
    });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[ONBOARDING-QUEUE] QueueEvents ready'))
      .catch((err: unknown) => console.error('[ONBOARDING-QUEUE] QueueEvents error:', err));
  }

  async addJob(data: OnboardingExtractionJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[ONBOARDING-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('extract-onboarding', compressedData, {
      removeOnComplete: { age: 3600, count: 200 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
    console.log(
      `[ONBOARDING-QUEUE] Job ${job.id} added (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    phase?: ExtractionPhase;
    message?: string;
    data?: { userId: string };
    result?: ExtractionResult;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    const progressData = job.progress as OnboardingExtractionProgress | number;

    let progress = 0;
    let phase: ExtractionPhase | undefined;
    let message: string | undefined;
    if (typeof progressData === 'object' && progressData !== null) {
      progress = progressData.progress;
      phase = progressData.phase;
      message = progressData.message;
    } else if (typeof progressData === 'number') {
      progress = progressData;
    }

    let userId: string | undefined;
    try {
      const raw = job.data as CompressedData<OnboardingExtractionJobData>;
      if (raw?.compressed) {
        const decompressed = decompressIfNeeded(raw);
        userId = decompressed.userId;
      } else if (raw?.data && typeof raw.data === 'object') {
        userId = (raw.data as OnboardingExtractionJobData).userId;
      }
    } catch {
      // Ignore decompression errors during status check
    }

    const status = {
      id: job.id!,
      state,
      progress,
      phase,
      message,
      data: userId ? { userId } : undefined,
      result: state === 'completed' ? (job.returnvalue as ExtractionResult) : undefined,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };

    console.log(
      `[ONBOARDING-QUEUE] Status ${jobId}: state=${state} progress=${progress}% phase=${phase ?? '-'} msg="${message ?? '-'}"`,
    );
    return status;
  }

  async cancelJob(jobId: string): Promise<{ cancelled: boolean; previousState: string }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();

    if (state === 'completed' || state === 'failed') {
      console.log(`[ONBOARDING-QUEUE] Job ${jobId} already ${state}, removing`);
      await job.remove();
      return { cancelled: true, previousState: state };
    }

    if (state === 'active') {
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
      await client.hset(keys.jobKey, 'failedReason', 'Cancelled by user');
      await client.hset(keys.jobKey, 'finishedOn', timestamp.toString());
      console.log(`[ONBOARDING-QUEUE] Job ${jobId} force-cancelled (was active)`);
    } else {
      await job.remove();
      console.log(`[ONBOARDING-QUEUE] Job ${jobId} removed (was ${state})`);
    }

    emitSocketFailed(jobId, 'CANCELLED', "Operazione annullata dall'utente");
    return { cancelled: true, previousState: state };
  }

  startWorker(): void {
    if (this.worker) {
      console.log('[ONBOARDING-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<OnboardingExtractionJobData>>) => {
        console.log(`[ONBOARDING-QUEUE] Processing job ${job.id}`);
        const startMs = Date.now();

        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

        try {
          const updateProgress = async (
            phase: ExtractionPhase,
            progress: number,
            message: string,
          ) => {
            const payload: OnboardingExtractionProgress = {
              version: 1,
              phase,
              progress,
              message,
              updatedAt: new Date().toISOString(),
            };
            await job.updateProgress(payload as unknown as number);
            if (job.id) {
              emitSocketProgress(job.id, payload);
            }
          };

          await updateProgress('validating', 0, 'Job ricevuto, inizio elaborazione...');
          const jobData = decompressIfNeeded(job.data);

          const userExists = await ensureUserOrSkip(jobData.userId, prisma, {
            jobId: job.id,
            queueName: QUEUE_NAME,
          });
          if (!userExists) {
            return skippedJobResult(`user ${jobData.userId} no longer exists`);
          }

          const buffer = Buffer.isBuffer(jobData.fileBuffer)
            ? jobData.fileBuffer
            : Buffer.from(jobData.fileBuffer.data);

          const useCase = new ExtractFromFileUseCase();

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`Job ${job.id} timed out after ${JOB_TIMEOUT_MS / 1000}s`));
            }, JOB_TIMEOUT_MS);
          });

          const result = await Promise.race([
            useCase.execute({
              fileBuffer: buffer,
              originalName: jobData.originalName,
              mimeType: jobData.mimeType,
              onProgress: (phase, progress, message) => {
                void updateProgress(phase, progress, message);
              },
            }),
            timeoutPromise,
          ]);

          if (timeoutHandle) clearTimeout(timeoutHandle);

          const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
          await updateProgress('completed', 100, `Completato in ${elapsedSec}s`);

          if (job.id) {
            emitSocketCompleted(job.id);
          }

          console.log(
            `[ONBOARDING-QUEUE] Job ${job.id} completed: ${result.fieldCount} fields, ` +
              `${result.productionUnitCount} PUs (${elapsedSec}s)`,
          );
          return { ...result, status: 'completed' as const };
        } catch (error) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          console.error(`[ONBOARDING-QUEUE] Job ${job.id} failed:`, error);
          if (job.id) {
            emitSocketFailed(
              job.id,
              'EXTRACTION_FAILED',
              error instanceof Error ? error.message : String(error),
            );
          }
          throw error;
        }
      },
      {
        connection,
        concurrency: 2,
        lockDuration: LOCK_DURATION_MS,
        lockRenewTime: LOCK_RENEW_TIME_MS,
        stalledInterval: STALLED_INTERVAL_MS,
        maxStalledCount: 2,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`[ONBOARDING-QUEUE] Job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[ONBOARDING-QUEUE] Job ${job?.id} failed:`, err);
    });
    console.log('[ONBOARDING-QUEUE] Worker started');
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[ONBOARDING-QUEUE] Worker stopped');
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
      console.log('[ONBOARDING-QUEUE] QueueEvents stopped');
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

let queueInstance: OnboardingExtractionQueue | null = null;

export function getOnboardingExtractionQueue(): OnboardingExtractionQueue {
  if (!queueInstance) {
    queueInstance = new OnboardingExtractionQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}
