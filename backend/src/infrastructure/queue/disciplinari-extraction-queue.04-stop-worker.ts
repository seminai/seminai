import type { DisciplinariExtractionQueueContext } from './disciplinari-extraction-queue.context';

export async function disciplinariExtractionQueueStopWorker(this: DisciplinariExtractionQueueContext): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[DISCIPLINARI-QUEUE] Worker stopped');
    }
  }
