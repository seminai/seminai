import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export async function dosageAgentQueueClose(this: DosageAgentQueueContext): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
