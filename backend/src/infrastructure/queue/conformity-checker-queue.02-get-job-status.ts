import { decompressIfNeeded, CompressedData } from '../utils/redis-compression.util';
import { ConformityCheckerJobData, ConformityCheckerJobResult, ConformityCheckerJobReturnValue } from './conformity-checker-queue.support';
import type { ConformityCheckerQueueContext } from './conformity-checker-queue.context';

export async function conformityCheckerQueueGetJobStatus(this: ConformityCheckerQueueContext, jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      jobGroupId: string;
      userId: string;
      notes?: string;
    };
    result?: ConformityCheckerJobResult;
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

    // Decomprime il risultato se era stato compresso
    let result: ConformityCheckerJobResult | undefined;
    if (job.returnvalue) {
      const returnValue = job.returnvalue as ConformityCheckerJobReturnValue;
      if (typeof returnValue === 'object' && returnValue !== null) {
        if ('compressed' in returnValue && 'data' in returnValue) {
          result = decompressIfNeeded(returnValue as CompressedData<ConformityCheckerJobResult>);
        } else {
          result = returnValue as ConformityCheckerJobResult;
        }
      }
    }

    // Decomprime i dati originali per estrarre le info
    const jobData = job.data
      ? (decompressIfNeeded(job.data) as ConformityCheckerJobData)
      : undefined;

    return {
      id: job.id!,
      state,
      progress,
      data: jobData
        ? {
            jobGroupId: jobData.input?.jobGroupId ?? '',
            userId: jobData.userId,
            notes: jobData.input?.notes,
          }
        : undefined,
      result,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }
