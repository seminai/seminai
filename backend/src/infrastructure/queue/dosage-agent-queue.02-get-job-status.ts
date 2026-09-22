import { decompressIfNeeded, CompressedData } from '../utils/redis-compression.util';
import { DosageAgentJobResult, ExternalDosageAgentJobResult, DosageAgentJobReturnValue } from './dosage-agent-queue.support';
import type { DosageAgentQueueContext } from './dosage-agent-queue.context';

export async function dosageAgentQueueGetJobStatus(this: DosageAgentQueueContext, jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      productsCount: number;
      unitsCount: number;
      unitsProcessed?: number;
      userId: string;
    };
    result?: DosageAgentJobResult;
    resultUrl?: string;
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
    let result: DosageAgentJobResult | undefined;
    let resultUrl: string | undefined;
    let unitsProcessedFromResult: number | undefined;
    if (job.returnvalue) {
      const returnValue = job.returnvalue as DosageAgentJobReturnValue;
      if (typeof returnValue === 'object' && returnValue !== null) {
        if ('externalResult' in returnValue) {
          resultUrl = returnValue.externalResult.url;
          // For external results, we have the count stored
          unitsProcessedFromResult = (returnValue as ExternalDosageAgentJobResult)
            .outcomeWithDosageCount;
        } else if ('compressed' in returnValue && 'data' in returnValue) {
          result = decompressIfNeeded(returnValue as CompressedData<DosageAgentJobResult>);
          unitsProcessedFromResult = result.outcomeWithDosage?.length;
        } else {
          result = returnValue as DosageAgentJobResult;
          unitsProcessedFromResult = result.outcomeWithDosage?.length;
        }
      }
    }

    const originalUnitsCount = job.data?.input?.unitOfProduction?.length ?? 0;
    // Use processed units count from result if available, otherwise use original input
    const effectiveUnitsCount = unitsProcessedFromResult ?? originalUnitsCount;

    return {
      id: job.id!,
      state,
      progress,
      data: job.data
        ? {
            productsCount: job.data.input?.products?.length ?? 0,
            // When job is completed, show the actual processed units count
            unitsCount: effectiveUnitsCount,
            // Also provide the original count for reference when different from processed
            unitsProcessed:
              unitsProcessedFromResult !== undefined &&
              unitsProcessedFromResult !== originalUnitsCount
                ? unitsProcessedFromResult
                : undefined,
            userId: job.data.userId,
          }
        : undefined,
      result,
      resultUrl,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }
