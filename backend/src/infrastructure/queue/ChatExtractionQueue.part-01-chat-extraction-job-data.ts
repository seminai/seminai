import { DocumentCategory } from '@prisma/client';
import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { compressIfNeeded, CompressedData, calculateSizeInMB } from '../utils/redis-compression.util';
import { processChatExtraction } from './ChatExtractionQueue.part-02-process-chat-extraction';

// ── Interfaces ──

export interface ChatExtractionJobData {
  readonly threadId: string;
  readonly fileBuffer: Buffer | { type: 'Buffer'; data: number[] };
  readonly fileName: string;
  readonly mimeType: string;
  readonly userId?: string;
  readonly mentions?: ReadonlyArray<{ type: string; id: string; label: string }>;
}

export interface ChatExtractionJobResult {
  readonly status: 'completed' | 'failed';
  readonly detectedFileType: 'agricultural' | 'invoice' | 'ddt';
  readonly documentCategory: DocumentCategory;
  /** JSON string identical to what the sync tool used to return */
  readonly toolResponse: string;
}

export const QUEUE_NAME = 'chat-extraction';

export const LOG_TAG = '[CHAT-EXTRACTION]';

// ── Queue class ──

export class ChatExtractionQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async addJob(data: ChatExtractionJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`${LOG_TAG} Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);

    const job = await this.queue.add('extract-pdf-chat', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(`${LOG_TAG} Job ${job.id} added to queue`);
    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    message?: string;
    result?: ChatExtractionJobResult;
    failedReason?: string;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const state = await job.getState();
    let progress = 0;
    let message: string | undefined;

    const rawProgress = job.progress;
    if (typeof rawProgress === 'object' && rawProgress !== null) {
      const obj = rawProgress as { percent?: number; message?: string };
      progress = obj.percent ?? 0;
      message = obj.message;
    } else {
      progress = typeof rawProgress === 'number' ? rawProgress : 0;
    }

    return {
      id: job.id!,
      state,
      progress,
      message,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  startWorker(): void {
    if (this.worker) {
      console.log(`${LOG_TAG} Worker already running`);
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<ChatExtractionJobData>>) => {
        return processChatExtraction(job);
      },
      { connection, concurrency: 1, lockDuration: 20 * 60 * 1000, lockRenewTime: 4 * 60 * 1000 },
    );

    this.worker.on('completed', (job) => console.log(`${LOG_TAG} Job ${job.id} completed`));
    this.worker.on('failed', (job, err) => console.error(`${LOG_TAG} Job ${job?.id} failed:`, err));
    console.log(`${LOG_TAG} Worker started`);
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log(`${LOG_TAG} Worker stopped`);
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

// ── Singleton ──

export let queueInstance: ChatExtractionQueue | null = null;

export function getChatExtractionQueue(): ChatExtractionQueue {
  if (!queueInstance) {
    queueInstance = new ChatExtractionQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}
