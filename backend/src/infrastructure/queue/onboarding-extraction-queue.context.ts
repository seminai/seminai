import { Queue, Worker, QueueEvents } from 'bullmq';
import { type ExtractionResult, type ExtractionPhase } from '../../application/use-cases/onboarding/ExtractFromFileUseCase';
import { OnboardingExtractionJobData } from './onboarding-extraction-queue.support';

export interface OnboardingExtractionQueueContext {
  readonly queue: Queue;
  queueEvents: QueueEvents | null;
  worker: Worker | null;
  addJob(data: OnboardingExtractionJobData): Promise<string>;
  getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    phase?: ExtractionPhase;
    message?: string;
    data?: { userId: string };
    result?: ExtractionResult;
    failedReason?: string;
    processedOn?: number;
    finishedOn?: number;
  }>;
  cancelJob(jobId: string): Promise<{ cancelled: boolean; previousState: string }>;
  startWorker(): void;
  stopWorker(): Promise<void>;
  close(): Promise<void>;
}
