import { Queue, Worker } from 'bullmq';
import { DisciplinariExtractionJobData, DisciplinariExtractionJobResult } from './disciplinari-extraction-queue.support';

export interface DisciplinariExtractionQueueContext {
  readonly queue: Queue;
  worker: Worker | null;
  addJob(data: DisciplinariExtractionJobData): Promise<string>;
  getJobStatus(jobId: string): Promise<{
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
  }>;
  startWorker(): void;
  stopWorker(): Promise<void>;
  close(): Promise<void>;
}
