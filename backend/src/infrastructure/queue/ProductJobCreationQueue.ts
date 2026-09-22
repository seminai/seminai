import { Queue, Worker, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';
import { QUEUE_NAME, ProductJobCreationJobData, ProductJobCreationJobResult } from './product-job-creation-queue.support';
import type { ProductJobCreationQueueContext } from './product-job-creation-queue.context';
export { type ProductJobCreationJobData, type ProductJobCreationJobResult } from './product-job-creation-queue.support';
import { productJobCreationQueueAddJob } from './product-job-creation-queue.01-add-job';
import { productJobCreationQueueGetJobStatus } from './product-job-creation-queue.02-get-job-status';
import { productJobCreationQueueStartWorker } from './product-job-creation-queue.03-start-worker';
import { productJobCreationQueueStopWorker } from './product-job-creation-queue.04-stop-worker';
import { productJobCreationQueueClose } from './product-job-creation-queue.05-close';


export class ProductJobCreationQueue {

  public readonly queue: Queue;
  public queueEvents: QueueEvents | null = null;
  public worker: Worker | null = null;
  readonly activeJobTokens: Map<string, string>;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    this.queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[PRODUCT-JOB-QUEUE] QueueEvents detected stalled job ${jobId}`);
    });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[PRODUCT-JOB-QUEUE] QueueEvents ready'))
      .catch((error: unknown) => console.error('[PRODUCT-JOB-QUEUE] QueueEvents error:', error));
    this.activeJobTokens = new Map();
  }

  /**
   * Aggiunge un job alla coda
   */
  async addJob(data: ProductJobCreationJobData): Promise<string> {
    return productJobCreationQueueAddJob.call(this as unknown as ProductJobCreationQueueContext, data);
  }

  /**
   * Ottiene lo stato di un job
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      userId: string;
    };
    result?: ProductJobCreationJobResult;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }> {
    return productJobCreationQueueGetJobStatus.call(this as unknown as ProductJobCreationQueueContext, jobId);
  }

  /**
   * Avvia il worker per processare i job
   */
  startWorker(): void {
    productJobCreationQueueStartWorker.call(this as unknown as ProductJobCreationQueueContext);
  }

  /**
   * Ferma il worker
   */
  async stopWorker(): Promise<void> {
    return productJobCreationQueueStopWorker.call(this as unknown as ProductJobCreationQueueContext);
  }

  /**
   * Chiude la coda
   */
  async close(): Promise<void> {
    return productJobCreationQueueClose.call(this as unknown as ProductJobCreationQueueContext);
  }
}

let queueInstance: ProductJobCreationQueue | null = null;

export function getProductJobCreationQueue(): ProductJobCreationQueue {
  queueInstance ??= new ProductJobCreationQueue();
  if (shouldStartQueueWorkers()) queueInstance.startWorker();
  return queueInstance;
}
