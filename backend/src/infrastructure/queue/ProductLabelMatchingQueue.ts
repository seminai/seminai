import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { prisma } from '../repositories/Prisma';
import {
  MatchProductLabelsUseCase,
  MatchProductLabelsOutput,
} from '../../application/use-cases/product/MatchProductLabelsUseCase';
import { isStaleSummary } from '../../application/use-cases/product/buildProductLabelSummary';

interface MatchJobData {
  readonly productIds: string[];
  readonly forceRefresh?: boolean;
}

interface SweepJobData {
  readonly sweep: true;
}

export type ProductLabelMatchingJobData = MatchJobData | SweepJobData;

const QUEUE_NAME = 'product-label-matching';
const SWEEP_JOB_ID = 'sweep-stale-products';
const SWEEP_CRON = '0,30 * * * *';
const SWEEP_BATCH_SIZE = 200;

function isSweepJob(data: ProductLabelMatchingJobData): data is SweepJobData {
  return (data as SweepJobData).sweep === true;
}

export class ProductLabelMatchingQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async addJob(data: MatchJobData): Promise<string> {
    const job = await this.queue.add('match-product-labels', data, {
      removeOnComplete: { age: 3600, count: 200 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
    console.log(`[LABEL-MATCHING-QUEUE] Job ${job.id} added (${data.productIds.length} products)`);
    return job.id!;
  }

  async scheduleRepeatableSweep(): Promise<void> {
    await this.queue.add('sweep-stale-products', { sweep: true } as SweepJobData, {
      repeat: { pattern: SWEEP_CRON },
      jobId: SWEEP_JOB_ID,
      removeOnComplete: { age: 3600, count: 50 },
      removeOnFail: { age: 7200, count: 50 },
    });
    console.log(`[LABEL-MATCHING-QUEUE] Sweep scheduled (cron: ${SWEEP_CRON})`);
  }

  startWorker(): void {
    if (this.worker) {
      console.log('[LABEL-MATCHING-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<ProductLabelMatchingJobData>) => this.processJob(job),
      { connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, err) => {
      console.error(`[LABEL-MATCHING-QUEUE] Job ${job?.id} failed:`, err);
    });
    console.log('[LABEL-MATCHING-QUEUE] Worker started');
  }

  private async processJob(
    job: Job<ProductLabelMatchingJobData>,
  ): Promise<MatchProductLabelsOutput> {
    await job.updateProgress(0);
    const useCase = new MatchProductLabelsUseCase(prisma);
    const productIds = isSweepJob(job.data)
      ? await this.pickStaleProductIds()
      : job.data.productIds;
    const forceRefresh = isSweepJob(job.data) ? false : job.data.forceRefresh === true;
    console.log(
      `[LABEL-MATCHING-QUEUE] Processing job ${job.id} (${productIds.length} products, sweep=${isSweepJob(job.data)})`,
    );
    const result = await useCase.execute({ productIds, forceRefresh });
    await job.updateProgress(100);
    console.log(
      `[LABEL-MATCHING-QUEUE] Job ${job.id} done: ${result.matched} matched, ${result.extracted} extracted, ${result.failed} failed`,
    );
    return result;
  }

  private async pickStaleProductIds(): Promise<string[]> {
    const rows = await prisma.product.findMany({
      where: { category: { in: ['PESTICIDE', 'FERTILIZER'] } },
      select: { id: true, labelMetadata: true },
      take: SWEEP_BATCH_SIZE * 5,
      orderBy: { updatedAt: 'asc' },
    });
    return rows
      .filter((r) => isStaleSummary(r.labelMetadata))
      .slice(0, SWEEP_BATCH_SIZE)
      .map((r) => r.id);
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

let queueInstance: ProductLabelMatchingQueue | null = null;

export function getProductLabelMatchingQueue(): ProductLabelMatchingQueue {
  if (!queueInstance) {
    queueInstance = new ProductLabelMatchingQueue();
    queueInstance.startWorker();
    void queueInstance.scheduleRepeatableSweep();
  }
  return queueInstance;
}
