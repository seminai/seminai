import type { ConformityCheckerQueueContext } from './conformity-checker-queue.context';

export async function conformityCheckerQueueClose(this: ConformityCheckerQueueContext): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
