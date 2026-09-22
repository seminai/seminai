import { compressIfNeeded, calculateSizeInMB } from '../utils/redis-compression.util';
import { DisciplinariExtractionJobData } from './disciplinari-extraction-queue.support';
import type { DisciplinariExtractionQueueContext } from './disciplinari-extraction-queue.context';

export async function disciplinariExtractionQueueAddJob(this: DisciplinariExtractionQueueContext, data: DisciplinariExtractionJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[DISCIPLINARI-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('extract-disciplinari', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(
      `[DISCIPLINARI-QUEUE] Job ${job.id} added to queue (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }
