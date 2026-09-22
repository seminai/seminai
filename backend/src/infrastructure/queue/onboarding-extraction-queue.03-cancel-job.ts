import { emitSocketFailed } from './onboarding-extraction-queue.support';
import type { OnboardingExtractionQueueContext } from './onboarding-extraction-queue.context';

export async function onboardingExtractionQueueCancelJob(this: OnboardingExtractionQueueContext, jobId: string): Promise<{ cancelled: boolean; previousState: string }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();

    if (state === 'completed' || state === 'failed') {
      console.log(`[ONBOARDING-QUEUE] Job ${jobId} already ${state}, removing`);
      await job.remove();
      return { cancelled: true, previousState: state };
    }

    if (state === 'active') {
      const client = await this.queue.client;
      const prefix = this.queue.opts?.prefix ?? 'bull';
      const queueName = this.queue.name;
      const keys = {
        active: `${prefix}:${queueName}:active`,
        failed: `${prefix}:${queueName}:failed`,
        jobKey: `${prefix}:${queueName}:${jobId}`,
      };
      await client.lrem(keys.active, 0, jobId);
      const timestamp = Date.now();
      await client.zadd(keys.failed, timestamp, jobId);
      await client.hset(keys.jobKey, 'failedReason', 'Cancelled by user');
      await client.hset(keys.jobKey, 'finishedOn', timestamp.toString());
      console.log(`[ONBOARDING-QUEUE] Job ${jobId} force-cancelled (was active)`);
    } else {
      await job.remove();
      console.log(`[ONBOARDING-QUEUE] Job ${jobId} removed (was ${state})`);
    }

    emitSocketFailed(jobId, 'CANCELLED', "Operazione annullata dall'utente");
    return { cancelled: true, previousState: state };
  }
