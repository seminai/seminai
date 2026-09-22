import { Queue, Worker, QueueEvents } from 'bullmq';
import { ConformityCheckerJobData, ConformityCheckerJobResult } from './conformity-checker-queue.support';

export interface ConformityCheckerQueueContext {
  readonly queue: Queue;
  queueEvents: QueueEvents | null;
  worker: Worker | null;
  readonly activeJobTokens: Map<string, string>;
  addJob(data: ConformityCheckerJobData): Promise<string>;
  getJobStatus(jobId: string): Promise<{
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
  }>;
  removeJob(jobId: string, force?: boolean): Promise<void>;
  startWorker(): void;
  stopWorker(): Promise<void>;
  close(): Promise<void>;
}
