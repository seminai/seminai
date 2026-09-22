import type { ConformityCheckerQueueContext } from './conformity-checker-queue.context';

export async function conformityCheckerQueueStopWorker(this: ConformityCheckerQueueContext): Promise<void> {
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
