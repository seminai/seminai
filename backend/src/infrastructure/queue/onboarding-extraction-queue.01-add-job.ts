import { compressIfNeeded, calculateSizeInMB } from '../utils/redis-compression.util';
import { OnboardingExtractionJobData } from './onboarding-extraction-queue.support';
import type { OnboardingExtractionQueueContext } from './onboarding-extraction-queue.context';

export async function onboardingExtractionQueueAddJob(this: OnboardingExtractionQueueContext, data: OnboardingExtractionJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[ONBOARDING-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('extract-onboarding', compressedData, {
      removeOnComplete: { age: 3600, count: 200 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
    console.log(
      `[ONBOARDING-QUEUE] Job ${job.id} added (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }
