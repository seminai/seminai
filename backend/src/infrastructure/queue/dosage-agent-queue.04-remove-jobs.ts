import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export async function dosageAgentQueueRemoveJobs(this: DosageAgentQueueContext, jobIds: string[], force: boolean = false): Promise<{ removedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let removedCount = 0;
    await Promise.allSettled(
      jobIds.map(async (jobId) => {
        try {
          await this.removeJob(jobId, force);
          removedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`${jobId}: ${errorMessage}`);
        }
      }),
    );
    return { removedCount, errors };
  }
