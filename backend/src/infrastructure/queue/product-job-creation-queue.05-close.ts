import type { ProductJobCreationQueueContext } from './product-job-creation-queue.context';

export async function productJobCreationQueueClose(this: ProductJobCreationQueueContext): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
