import { LOCK_DURATION_MS } from './dosage-agent-queue.support';
import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export async function dosageAgentQueueHandleLockRenewalFailure(this: DosageAgentQueueContext, jobIds: string[]): Promise<void> {
    await Promise.allSettled(
      jobIds.map(async (jobId) => {
        try {
          const job = await this.queue.getJob(jobId);
          if (!job) {
            console.error(`[DOSAGE-QUEUE] Unable to fetch job ${jobId} after lock renewal failure`);
            return;
          }
          const lockToken = this.activeJobTokens.get(jobId) ?? job.token ?? '';
          const errorMessage = `Lock renewal failed after ${LOCK_DURATION_MS}ms for job ${jobId}`;
          const error = new Error(errorMessage);
          error.name = 'LockRenewalFailedError';
          if (lockToken) {
            await job.moveToFailed(error, lockToken);
            console.error(`[DOSAGE-QUEUE] Job ${jobId} moved to failed due to lock issue`);
          } else {
            await job.log(`[LOCK-RENEWAL] ${errorMessage}`);
            job.failedReason = errorMessage;
            console.error(
              `[DOSAGE-QUEUE] Missing lock token for job ${jobId}; recorded failure reason for visibility`,
            );
          }
          this.activeJobTokens.delete(jobId);
        } catch (err) {
          console.error(`[DOSAGE-QUEUE] Error handling lock failure for job ${jobId}:`, err);
        }
      }),
    );
  }
