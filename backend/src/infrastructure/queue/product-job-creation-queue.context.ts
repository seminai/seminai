import { Queue, Worker, QueueEvents } from 'bullmq';
import { ProductJobCreationJobData, ProductJobCreationJobResult } from './product-job-creation-queue.support';

export interface ProductJobCreationQueueContext {
  readonly queue: Queue;
  queueEvents: QueueEvents | null;
  worker: Worker | null;
  readonly activeJobTokens: Map<string, string>;
  addJob(data: ProductJobCreationJobData): Promise<string>;
  getJobStatus(jobId: string): Promise<{
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
  }>;
  startWorker(): void;
  stopWorker(): Promise<void>;
  close(): Promise<void>;
}
