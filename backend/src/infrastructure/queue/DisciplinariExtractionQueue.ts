import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { DisciplinariExtractionJobData, DisciplinariExtractionJobResult, QUEUE_NAME } from './disciplinari-extraction-queue.support';
import type { DisciplinariExtractionQueueContext } from './disciplinari-extraction-queue.context';
export { type DisciplinariExtractionJobData, type DisciplinariExtractionJobResult } from './disciplinari-extraction-queue.support';
import { disciplinariExtractionQueueAddJob } from './disciplinari-extraction-queue.01-add-job';
import { disciplinariExtractionQueueGetJobStatus } from './disciplinari-extraction-queue.02-get-job-status';
import { disciplinariExtractionQueueStartWorker } from './disciplinari-extraction-queue.03-start-worker';
import { disciplinariExtractionQueueStopWorker } from './disciplinari-extraction-queue.04-stop-worker';
import { disciplinariExtractionQueueClose } from './disciplinari-extraction-queue.05-close';


/**
 * Queue for asynchronous disciplinari extraction with deduplication support.
 */
export class DisciplinariExtractionQueue {

  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  /**
   * Adds a new extraction job to the queue.
   */
  async addJob(data: DisciplinariExtractionJobData): Promise<string> {
    return disciplinariExtractionQueueAddJob.call(this as unknown as DisciplinariExtractionQueueContext, data);
  }

  /**
   * Gets the status of a job.
   */
  async getJobStatus(jobId: string): Promise<{
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
    return disciplinariExtractionQueueGetJobStatus.call(this as unknown as DisciplinariExtractionQueueContext, jobId);
  }

  /**
   * Starts the worker to process jobs.
   */
  startWorker(): void {
    disciplinariExtractionQueueStartWorker.call(this as unknown as DisciplinariExtractionQueueContext);
  }

  /**
   * Stops the worker.
   */
  async stopWorker(): Promise<void> {
    return disciplinariExtractionQueueStopWorker.call(this as unknown as DisciplinariExtractionQueueContext);
  }

  /**
   * Closes the queue and worker.
   */
  async close(): Promise<void> {
    return disciplinariExtractionQueueClose.call(this as unknown as DisciplinariExtractionQueueContext);
  }
}

let queueInstance: DisciplinariExtractionQueue | null = null;

export function getDisciplinariExtractionQueue(): DisciplinariExtractionQueue {
  queueInstance ??= new DisciplinariExtractionQueue();
  queueInstance.startWorker();
  return queueInstance;
}
