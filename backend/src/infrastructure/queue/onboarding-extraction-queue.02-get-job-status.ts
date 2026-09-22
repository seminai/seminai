import { decompressIfNeeded, CompressedData } from '../utils/redis-compression.util';
import { type ExtractionResult, type ExtractionPhase } from '../../application/use-cases/onboarding/ExtractFromFileUseCase';
import { OnboardingExtractionJobData, OnboardingExtractionProgress } from './onboarding-extraction-queue.support';
import type { OnboardingExtractionQueueContext } from './onboarding-extraction-queue.context';

export async function onboardingExtractionQueueGetJobStatus(this: OnboardingExtractionQueueContext, jobId: string): Promise<{
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
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    const progressData = job.progress as OnboardingExtractionProgress | number;

    let progress = 0;
    let phase: ExtractionPhase | undefined;
    let message: string | undefined;
    if (typeof progressData === 'object' && progressData !== null) {
      progress = progressData.progress;
      phase = progressData.phase;
      message = progressData.message;
    } else if (typeof progressData === 'number') {
      progress = progressData;
    }

    let userId: string | undefined;
    try {
      const raw = job.data as CompressedData<OnboardingExtractionJobData>;
      if (raw?.compressed) {
        const decompressed = decompressIfNeeded(raw);
        userId = decompressed.userId;
      } else if (raw?.data && typeof raw.data === 'object') {
        userId = (raw.data as OnboardingExtractionJobData).userId;
      }
    } catch {
      // Ignore decompression errors during status check
    }

    const status = {
      id: job.id!,
      state,
      progress,
      phase,
      message,
      data: userId ? { userId } : undefined,
      result: state === 'completed' ? (job.returnvalue as ExtractionResult) : undefined,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };

    console.log(
      `[ONBOARDING-QUEUE] Status ${jobId}: state=${state} progress=${progress}% phase=${phase ?? '-'} msg="${message ?? '-'}"`,
    );
    return status;
  }
