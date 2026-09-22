import { DisciplinariExtractionJobResult } from './disciplinari-extraction-queue.support';
import type { DisciplinariExtractionQueueContext } from './disciplinari-extraction-queue.context';

export async function disciplinariExtractionQueueGetJobStatus(this: DisciplinariExtractionQueueContext, jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      filesCount: number;
      fileNames: string[];
      userId: string;
      concurrency?: number;
      forceReExtract?: boolean;
    };
    result?: DisciplinariExtractionJobResult;
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
    return {
      id: job.id!,
      state,
      progress,
      data: job.data
        ? {
            filesCount: job.data.files?.length ?? 0,
            fileNames: job.data.files?.map((f: { fileName: string }) => f.fileName) ?? [],
            userId: job.data.userId,
            concurrency: job.data.concurrency,
            forceReExtract: job.data.forceReExtract,
          }
        : undefined,
      result: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }
