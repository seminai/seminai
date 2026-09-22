import type { OnboardingExtractionQueueContext } from './onboarding-extraction-queue.context';

export async function onboardingExtractionQueueStopWorker(this: OnboardingExtractionQueueContext): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[ONBOARDING-QUEUE] Worker stopped');
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
      console.log('[ONBOARDING-QUEUE] QueueEvents stopped');
    }
  }
