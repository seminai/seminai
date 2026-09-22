import { compressIfNeeded, calculateSizeInMB } from '../utils/redis-compression.util';
import { ConformityCheckerJobData } from './conformity-checker-queue.support';
import type { ConformityCheckerQueueContext } from './conformity-checker-queue.context';

export async function conformityCheckerQueueAddJob(this: ConformityCheckerQueueContext, data: ConformityCheckerJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[CONFORMITY-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('check-conformity', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(
      `[CONFORMITY-QUEUE] Job ${job.id} added to queue (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }
