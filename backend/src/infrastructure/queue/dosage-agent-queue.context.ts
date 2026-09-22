import { Queue, Worker, QueueEvents } from 'bullmq';
import { DosageAgentJobData, DosageAgentJobResult } from './dosage-agent-queue.support';

export interface DosageAgentQueueContext {
  readonly queue: Queue;
  queueEvents: QueueEvents | null;
  worker: Worker | null;
  readonly activeJobTokens: Map<string, string>;
  addJob(data: DosageAgentJobData): Promise<string>;
  getJobStatus(jobId: string): Promise<{
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
  }>;
  removeJob(jobId: string, force?: boolean): Promise<void>;
  removeJobs(jobIds: string[], force?: boolean): Promise<{ removedCount: number; errors: string[] }>;
  startWorker(): void;
  stopWorker(): Promise<void>;
  close(): Promise<void>;
  deductCreditsForJob(jobId: string, userId: string): Promise<void>;
  handleLockRenewalFailure(jobIds: string[]): Promise<void>;
}
