import { Queue, Worker, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { DosageAgentJobData, DosageAgentJobResult, QUEUE_NAME } from './dosage-agent-queue.support';
import type { DosageAgentQueueContext } from './dosage-agent-queue.context';
export { type DosageAgentJobData, type DosageAgentJobResult, type ExternalDosageAgentJobResult } from './dosage-agent-queue.support';
import { dosageAgentQueueAddJob } from './dosage-agent-queue.01-add-job';
import { dosageAgentQueueGetJobStatus } from './dosage-agent-queue.02-get-job-status';
import { dosageAgentQueueRemoveJob } from './dosage-agent-queue.03-remove-job';
import { dosageAgentQueueRemoveJobs } from './dosage-agent-queue.04-remove-jobs';
import { dosageAgentQueueStartWorker } from './dosage-agent-queue.05-start-worker';
import { dosageAgentQueueStopWorker } from './dosage-agent-queue.06-stop-worker';
import { dosageAgentQueueClose } from './dosage-agent-queue.07-close';
import { dosageAgentQueueDeductCreditsForJob } from './dosage-agent-queue.08-deduct-credits-for-job';
import { dosageAgentQueueHandleLockRenewalFailure } from './dosage-agent-queue.09-handle-lock-renewal-failure';


export class DosageAgentQueue {

  public readonly queue: Queue;
  public queueEvents: QueueEvents | null = null;
  public worker: Worker | null = null;
  readonly activeJobTokens: Map<string, string>;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    this.queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[DOSAGE-QUEUE] QueueEvents detected stalled job ${jobId}`);
    });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[DOSAGE-QUEUE] QueueEvents ready'))
      .catch((error: unknown) => console.error('[DOSAGE-QUEUE] QueueEvents error:', error));
    this.activeJobTokens = new Map();
  }

  async addJob(data: DosageAgentJobData): Promise<string> {
    return dosageAgentQueueAddJob.call(this as unknown as DosageAgentQueueContext, data);
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      productsCount: number;
      unitsCount: number;
      unitsProcessed?: number;
      userId: string;
    };
    result?: DosageAgentJobResult;
    resultUrl?: string;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }> {
    return dosageAgentQueueGetJobStatus.call(this as unknown as DosageAgentQueueContext, jobId);
  }

  async removeJob(jobId: string, force: boolean = false): Promise<void> {
    return dosageAgentQueueRemoveJob.call(this as unknown as DosageAgentQueueContext, jobId, force);
  }

  async removeJobs(
    jobIds: string[],
    force: boolean = false,
  ): Promise<{ removedCount: number; errors: string[] }> {
    return dosageAgentQueueRemoveJobs.call(this as unknown as DosageAgentQueueContext, jobIds, force);
  }

  startWorker(): void {
    dosageAgentQueueStartWorker.call(this as unknown as DosageAgentQueueContext);
  }

  async stopWorker(): Promise<void> {
    return dosageAgentQueueStopWorker.call(this as unknown as DosageAgentQueueContext);
  }

  async close(): Promise<void> {
    return dosageAgentQueueClose.call(this as unknown as DosageAgentQueueContext);
  }

  async deductCreditsForJob(jobId: string, userId: string): Promise<void> {
    return dosageAgentQueueDeductCreditsForJob.call(this as unknown as DosageAgentQueueContext, jobId, userId);
  }

  async handleLockRenewalFailure(jobIds: string[]): Promise<void> {
    return dosageAgentQueueHandleLockRenewalFailure.call(this as unknown as DosageAgentQueueContext, jobIds);
  }
}

let queueInstance: DosageAgentQueue | null = null;

export function getDosageAgentQueue(): DosageAgentQueue {
  queueInstance ??= new DosageAgentQueue();
  queueInstance.startWorker();
  return queueInstance;
}
