import { compressIfNeeded, calculateSizeInMB } from '../utils/redis-compression.util';
import { DosageAgentJobData } from './dosage-agent-queue.support';
import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export async function dosageAgentQueueAddJob(this: DosageAgentQueueContext, data: DosageAgentJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[DOSAGE-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('calculate-dosage', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(
      `[DOSAGE-QUEUE] Job ${job.id} added to queue (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }
