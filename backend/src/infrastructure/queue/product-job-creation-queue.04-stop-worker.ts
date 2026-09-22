import type { ProductJobCreationQueueContext } from './product-job-creation-queue.context';

export async function productJobCreationQueueStopWorker(this: ProductJobCreationQueueContext): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[PRODUCT-JOB-QUEUE] Worker stopped');
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
      console.log('[PRODUCT-JOB-QUEUE] QueueEvents stopped');
    }
  }
