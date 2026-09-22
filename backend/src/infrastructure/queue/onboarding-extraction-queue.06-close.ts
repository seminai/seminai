import type { OnboardingExtractionQueueContext } from './onboarding-extraction-queue.context';

export async function onboardingExtractionQueueClose(this: OnboardingExtractionQueueContext): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
