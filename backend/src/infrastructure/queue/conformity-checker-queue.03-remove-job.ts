import { DosageAgentJobState } from '../../domain/entities/DosageAgentJob';
import { dosageAgentJobRepository } from './conformity-checker-queue.support';
import type { ConformityCheckerQueueContext } from './conformity-checker-queue.context';

export async function conformityCheckerQueueRemoveJob(this: ConformityCheckerQueueContext, jobId: string, force: boolean = false): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    if (state === 'active') {
      if (force) {
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
        await client.hset(keys.jobKey, 'failedReason', 'Job cancelled by user (force)');
        await client.hset(keys.jobKey, 'finishedOn', timestamp.toString());
        try {
          await dosageAgentJobRepository.updateStatus({
            jobId,
            state: DosageAgentJobState.FAILED,
            failedReason: 'Job cancelled by user (force)',
            finishedOn: new Date(timestamp),
          });
          console.log(
            `[CONFORMITY-QUEUE] Job ${jobId} force-cancelled via Redis and DB updated to FAILED`,
          );
        } catch (dbError) {
          console.warn(
            `[CONFORMITY-QUEUE] Job ${jobId} force-cancelled but DB update failed:`,
            dbError,
          );
        }
      } else {
        throw new Error(
          `Job ${jobId} is currently running. Use force=true to cancel it, or wait for it to complete.`,
        );
      }
    } else {
      await job.remove();
      try {
        const existingJob = await dosageAgentJobRepository.findById(jobId);
        if (existingJob) {
          await dosageAgentJobRepository.updateStatus({
            jobId,
            state: DosageAgentJobState.FAILED,
            failedReason: 'Job removed by user',
            finishedOn: new Date(),
          });
        }
      } catch {
        // Ignore DB errors for non-active jobs
      }
      console.log(`[CONFORMITY-QUEUE] Job ${jobId} removed (was ${state})`);
    }
  }
