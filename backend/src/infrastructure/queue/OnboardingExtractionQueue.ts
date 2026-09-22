import { Queue, Worker, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { type ExtractionResult, type ExtractionPhase } from '../../application/use-cases/onboarding/ExtractFromFileUseCase';
import { QUEUE_NAME, OnboardingExtractionJobData } from './onboarding-extraction-queue.support';
import type { OnboardingExtractionQueueContext } from './onboarding-extraction-queue.context';
export { type OnboardingExtractionJobData, type OnboardingExtractionJobResult, type OnboardingExtractionProgress } from './onboarding-extraction-queue.support';
import { onboardingExtractionQueueAddJob } from './onboarding-extraction-queue.01-add-job';
import { onboardingExtractionQueueGetJobStatus } from './onboarding-extraction-queue.02-get-job-status';
import { onboardingExtractionQueueCancelJob } from './onboarding-extraction-queue.03-cancel-job';
import { onboardingExtractionQueueStartWorker } from './onboarding-extraction-queue.04-start-worker';
import { onboardingExtractionQueueStopWorker } from './onboarding-extraction-queue.05-stop-worker';
import { onboardingExtractionQueueClose } from './onboarding-extraction-queue.06-close';


export class OnboardingExtractionQueue {

  public readonly queue: Queue;
  public queueEvents: QueueEvents | null = null;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    this.queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[ONBOARDING-QUEUE] Stalled job ${jobId}`);
    });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[ONBOARDING-QUEUE] QueueEvents ready'))
      .catch((err: unknown) => console.error('[ONBOARDING-QUEUE] QueueEvents error:', err));
  }

  async addJob(data: OnboardingExtractionJobData): Promise<string> {
    return onboardingExtractionQueueAddJob.call(this as unknown as OnboardingExtractionQueueContext, data);
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    phase?: ExtractionPhase;
    message?: string;
    data?: { userId: string };
    result?: ExtractionResult;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }> {
    return onboardingExtractionQueueGetJobStatus.call(this as unknown as OnboardingExtractionQueueContext, jobId);
  }

  async cancelJob(jobId: string): Promise<{ cancelled: boolean; previousState: string }> {
    return onboardingExtractionQueueCancelJob.call(this as unknown as OnboardingExtractionQueueContext, jobId);
  }

  startWorker(): void {
    onboardingExtractionQueueStartWorker.call(this as unknown as OnboardingExtractionQueueContext);
  }

  async stopWorker(): Promise<void> {
    return onboardingExtractionQueueStopWorker.call(this as unknown as OnboardingExtractionQueueContext);
  }

  async close(): Promise<void> {
    return onboardingExtractionQueueClose.call(this as unknown as OnboardingExtractionQueueContext);
  }
}

let queueInstance: OnboardingExtractionQueue | null = null;

export function getOnboardingExtractionQueue(): OnboardingExtractionQueue {
  queueInstance ??= new OnboardingExtractionQueue();
  queueInstance.startWorker();
  return queueInstance;
}
