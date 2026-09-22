import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export async function dosageAgentQueueStopWorker(this: DosageAgentQueueContext): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[DOSAGE-QUEUE] Worker stopped');
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
      console.log('[DOSAGE-QUEUE] QueueEvents stopped');
    }
  }
