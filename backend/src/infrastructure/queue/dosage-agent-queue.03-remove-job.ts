import { PrismaDosageAgentJobRepository } from '../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../repositories/Prisma';
import { DosageAgentJobState } from '../../domain/entities/DosageAgentJob';
import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export async function dosageAgentQueueRemoveJob(this: DosageAgentQueueContext, jobId: string, force: boolean = false): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    // If job is active (running), we need special handling
    if (state === 'active') {
      if (force) {
        // Force removal of active jobs using script execution
        // This bypasses the lock mechanism by directly manipulating Redis
        const client = await this.queue.client;
        const prefix = this.queue.opts?.prefix ?? 'bull';
        const queueName = this.queue.name;
        const keys = {
          active: `${prefix}:${queueName}:active`,
          failed: `${prefix}:${queueName}:failed`,
          jobKey: `${prefix}:${queueName}:${jobId}`,
        };
        // Remove from active list
        await client.lrem(keys.active, 0, jobId);
        // Add to failed set with timestamp
        const timestamp = Date.now();
        await client.zadd(keys.failed, timestamp, jobId);
        // Update job state in hash
        await client.hset(keys.jobKey, 'failedReason', 'Job cancelled by user (force)');
        await client.hset(keys.jobKey, 'finishedOn', timestamp.toString());
        // Update DosageAgentJob in database to FAILED
        try {
          const dosageJobRepository = new PrismaDosageAgentJobRepository(prisma);
          await dosageJobRepository.updateStatus({
            jobId,
            state: DosageAgentJobState.FAILED,
            failedReason: 'Job cancelled by user (force)',
            finishedOn: new Date(timestamp),
          });
          console.log(
            `[DOSAGE-QUEUE] Job ${jobId} force-cancelled via Redis and DB updated to FAILED`,
          );
        } catch (dbError) {
          // Log but don't fail - the Redis operation was successful
          console.warn(
            `[DOSAGE-QUEUE] Job ${jobId} force-cancelled but DB update failed:`,
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
      // Also update DB state if job exists there
      try {
        const dosageJobRepository = new PrismaDosageAgentJobRepository(prisma);
        const existingJob = await dosageJobRepository.findById(jobId);
        if (existingJob) {
          await dosageJobRepository.updateStatus({
            jobId,
            state: DosageAgentJobState.FAILED,
            failedReason: 'Job removed by user',
            finishedOn: new Date(),
          });
        }
      } catch {
        // Ignore DB errors for non-active jobs
      }
      console.log(`[DOSAGE-QUEUE] Job ${jobId} removed (was ${state})`);
    }
  }
