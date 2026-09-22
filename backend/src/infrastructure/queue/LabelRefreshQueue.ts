import { Job, Queue, Worker } from 'bullmq';
import { prisma } from '../repositories/Prisma';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';
import { getRedisConnection } from './redis.connection';
import { LabelRefreshProcessor } from './LabelRefreshProcessor';
import { LabelRefreshJobData, LabelRefreshJobResult, LabelRefreshMode } from './LabelRefreshTypes';

const QUEUE_NAME = 'label-refresh';

export class LabelRefreshQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async addJob(data: LabelRefreshJobData): Promise<string> {
    const job = await this.queue.add('refresh-labels', this.normalizeJobData(data), {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 10_000 },
    });
    console.log(`[LABEL-REFRESH-QUEUE] Job ${job.id} added (${data.mode})`);
    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<{
    readonly id: string;
    readonly state: string;
    readonly progress: number;
    readonly data?: LabelRefreshJobData;
    readonly result?: LabelRefreshJobResult;
    readonly failedReason?: string;
    readonly processedOn?: number;
    readonly finishedOn?: number;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    return {
      id: job.id!,
      state: await job.getState(),
      progress: job.progress as number,
      data: job.data as LabelRefreshJobData,
      result: job.returnvalue as LabelRefreshJobResult | undefined,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  startWorker(): void {
    if (this.worker) {
      console.log('[LABEL-REFRESH-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<LabelRefreshJobData>) => this.processJob(job),
      { connection, concurrency: 1 },
    );
    this.worker.on('completed', (job) => {
      console.log(`[LABEL-REFRESH-QUEUE] Job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[LABEL-REFRESH-QUEUE] Job ${job?.id} failed:`, err);
    });
    console.log('[LABEL-REFRESH-QUEUE] Worker started');
  }

  async stopWorker(): Promise<void> {
    if (!this.worker) return;
    await this.worker.close();
    this.worker = null;
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }

  private async processJob(job: Job<LabelRefreshJobData>): Promise<LabelRefreshJobResult> {
    console.log(`[LABEL-REFRESH-QUEUE] Processing job ${job.id}`);
    await job.updateProgress(0);
    const processor = new LabelRefreshProcessor(prisma);
    const result = await processor.process(job.data);
    await job.updateProgress(100);
    return result;
  }

  private normalizeJobData(data: LabelRefreshJobData): LabelRefreshJobData {
    return {
      mode: this.normalizeMode(data.mode),
      labelExtractionIds: data.labelExtractionIds ?? [],
      limit: data.limit,
      dryRun: data.dryRun === true,
    };
  }

  private normalizeMode(mode: LabelRefreshMode): LabelRefreshMode {
    return ['stale', 'all', 'ids'].includes(mode) ? mode : 'stale';
  }
}

let queueInstance: LabelRefreshQueue | null = null;

export function getLabelRefreshQueue(options?: {
  readonly startWorker?: boolean;
}): LabelRefreshQueue {
  if (!queueInstance) queueInstance = new LabelRefreshQueue();
  if (options?.startWorker && shouldStartQueueWorkers()) queueInstance.startWorker();
  return queueInstance;
}
