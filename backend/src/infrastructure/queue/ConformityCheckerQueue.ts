import { Queue, Worker, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { ConformityCheckerJobData, ConformityCheckerJobResult, QUEUE_NAME } from './conformity-checker-queue.support';
import type { ConformityCheckerQueueContext } from './conformity-checker-queue.context';
export { type ConformityCheckerJobData, type ConformityCheckerJobResult, confirmConformityProposals } from './conformity-checker-queue.support';
import { conformityCheckerQueueAddJob } from './conformity-checker-queue.01-add-job';
import { conformityCheckerQueueGetJobStatus } from './conformity-checker-queue.02-get-job-status';
import { conformityCheckerQueueRemoveJob } from './conformity-checker-queue.03-remove-job';
import { conformityCheckerQueueStartWorker } from './conformity-checker-queue.04-start-worker';
import { conformityCheckerQueueStopWorker } from './conformity-checker-queue.05-stop-worker';
import { conformityCheckerQueueClose } from './conformity-checker-queue.06-close';


export class ConformityCheckerQueue {

  public readonly queue: Queue;
  public queueEvents: QueueEvents | null = null;
  public worker: Worker | null = null;
  readonly activeJobTokens: Map<string, string>;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    this.queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[CONFORMITY-QUEUE] QueueEvents detected stalled job ${jobId}`);
    });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[CONFORMITY-QUEUE] QueueEvents ready'))
      .catch((error: unknown) => console.error('[CONFORMITY-QUEUE] QueueEvents error:', error));
    this.activeJobTokens = new Map();
  }

  /**
   * Aggiunge un job alla coda per il controllo di conformità
   */
  async addJob(data: ConformityCheckerJobData): Promise<string> {
    return conformityCheckerQueueAddJob.call(this as unknown as ConformityCheckerQueueContext, data);
  }

  /**
   * Ottiene lo stato di un job
   */
  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      jobGroupId: string;
      userId: string;
      notes?: string;
    };
    result?: ConformityCheckerJobResult;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }> {
    return conformityCheckerQueueGetJobStatus.call(this as unknown as ConformityCheckerQueueContext, jobId);
  }

  /**
   * Rimuove un job dalla coda
   */
  async removeJob(jobId: string, force: boolean = false): Promise<void> {
    return conformityCheckerQueueRemoveJob.call(this as unknown as ConformityCheckerQueueContext, jobId, force);
  }

  /**
   * Avvia il worker per processare i job
   */
  startWorker(): void {
    conformityCheckerQueueStartWorker.call(this as unknown as ConformityCheckerQueueContext);
  }

  /**
   * Ferma il worker
   */
  async stopWorker(): Promise<void> {
    return conformityCheckerQueueStopWorker.call(this as unknown as ConformityCheckerQueueContext);
  }

  /**
   * Chiude la coda
   */
  async close(): Promise<void> {
    return conformityCheckerQueueClose.call(this as unknown as ConformityCheckerQueueContext);
  }
}

let queueInstance: ConformityCheckerQueue | null = null;

export function getConformityCheckerQueue(): ConformityCheckerQueue {
  queueInstance ??= new ConformityCheckerQueue();
  queueInstance.startWorker();
  return queueInstance;
}
