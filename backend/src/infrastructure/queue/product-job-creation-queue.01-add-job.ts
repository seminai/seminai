import { compressIfNeeded, calculateSizeInMB } from '../utils/redis-compression.util';
import { ProductJobCreationJobData } from './product-job-creation-queue.support';
import type { ProductJobCreationQueueContext } from './product-job-creation-queue.context';

export async function productJobCreationQueueAddJob(this: ProductJobCreationQueueContext, data: ProductJobCreationJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[PRODUCT-JOB-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('create-product-and-job', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(
      `[PRODUCT-JOB-QUEUE] Job ${job.id} added to queue (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }
