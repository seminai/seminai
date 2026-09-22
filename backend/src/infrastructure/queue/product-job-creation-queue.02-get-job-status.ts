import { decompressIfNeeded, CompressedData } from '../utils/redis-compression.util';
import { ProductJobCreationJobData, ProductJobCreationJobResult, ProductJobCreationJobReturnValue } from './product-job-creation-queue.support';
import type { ProductJobCreationQueueContext } from './product-job-creation-queue.context';

export async function productJobCreationQueueGetJobStatus(this: ProductJobCreationQueueContext, jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      userId: string;
    };
    result?: ProductJobCreationJobResult;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    const progress = job.progress as number;

    let result: ProductJobCreationJobResult | undefined;
    if (job.returnvalue) {
      const returnValue = job.returnvalue as ProductJobCreationJobReturnValue;
      if (typeof returnValue === 'object' && returnValue !== null) {
        if ('compressed' in returnValue && 'data' in returnValue) {
          result = decompressIfNeeded(returnValue as CompressedData<ProductJobCreationJobResult>);
        } else {
          result = returnValue as ProductJobCreationJobResult;
        }
      }
    }

    const jobData = job.data
      ? (decompressIfNeeded(job.data) as ProductJobCreationJobData)
      : undefined;

    return {
      id: job.id!,
      state,
      progress,
      data: jobData ? { userId: jobData.userId } : undefined,
      result,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }
