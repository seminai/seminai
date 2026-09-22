import type { DisciplinariExtractionQueueContext } from './disciplinari-extraction-queue.context';

export async function disciplinariExtractionQueueClose(this: DisciplinariExtractionQueueContext): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
