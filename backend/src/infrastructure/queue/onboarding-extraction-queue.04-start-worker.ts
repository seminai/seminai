import { Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { decompressIfNeeded, CompressedData } from '../utils/redis-compression.util';
import { ExtractFromFileUseCase, type ExtractionPhase } from '../../application/use-cases/onboarding/ExtractFromFileUseCase';
import { prisma } from '../repositories/Prisma';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';
import { QUEUE_NAME, LOCK_DURATION_MS, LOCK_RENEW_TIME_MS, STALLED_INTERVAL_MS, JOB_TIMEOUT_MS, OnboardingExtractionJobData, OnboardingExtractionProgress, emitSocketProgress, emitSocketCompleted, emitSocketFailed } from './onboarding-extraction-queue.support';
import type { OnboardingExtractionQueueContext } from './onboarding-extraction-queue.context';

export function onboardingExtractionQueueStartWorker(this: OnboardingExtractionQueueContext): void {
    if (this.worker) {
      console.log('[ONBOARDING-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<OnboardingExtractionJobData>>) => {
        console.log(`[ONBOARDING-QUEUE] Processing job ${job.id}`);
        const startMs = Date.now();

        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

        try {
          const updateProgress = async (
            phase: ExtractionPhase,
            progress: number,
            message: string,
          ) => {
            const payload: OnboardingExtractionProgress = {
              version: 1,
              phase,
              progress,
              message,
              updatedAt: new Date().toISOString(),
            };
            await job.updateProgress(payload as unknown as number);
            if (job.id) {
              emitSocketProgress(job.id, payload);
            }
          };

          await updateProgress('validating', 0, 'Job ricevuto, inizio elaborazione...');
          const jobData = decompressIfNeeded(job.data);

          const userExists = await ensureUserOrSkip(jobData.userId, prisma, {
            jobId: job.id,
            queueName: QUEUE_NAME,
          });
          if (!userExists) {
            return skippedJobResult(`user ${jobData.userId} no longer exists`);
          }

          const buffer = Buffer.isBuffer(jobData.fileBuffer)
            ? jobData.fileBuffer
            : Buffer.from(jobData.fileBuffer.data);

          const useCase = new ExtractFromFileUseCase();

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`Job ${job.id} timed out after ${JOB_TIMEOUT_MS / 1000}s`));
            }, JOB_TIMEOUT_MS);
          });

          const result = await Promise.race([
            useCase.execute({
              fileBuffer: buffer,
              originalName: jobData.originalName,
              mimeType: jobData.mimeType,
              onProgress: (phase, progress, message) => {
                void updateProgress(phase, progress, message);
              },
            }),
            timeoutPromise,
          ]);

          if (timeoutHandle) clearTimeout(timeoutHandle);

          const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
          await updateProgress('completed', 100, `Completato in ${elapsedSec}s`);

          if (job.id) {
            emitSocketCompleted(job.id);
          }

          console.log(
            `[ONBOARDING-QUEUE] Job ${job.id} completed: ${result.fieldCount} fields, ` +
              `${result.productionUnitCount} PUs (${elapsedSec}s)`,
          );
          return { ...result, status: 'completed' as const };
        } catch (error) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          console.error(`[ONBOARDING-QUEUE] Job ${job.id} failed:`, error);
          if (job.id) {
            emitSocketFailed(
              job.id,
              'EXTRACTION_FAILED',
              error instanceof Error ? error.message : String(error),
            );
          }
          throw error;
        }
      },
      {
        connection,
        concurrency: 2,
        lockDuration: LOCK_DURATION_MS,
        lockRenewTime: LOCK_RENEW_TIME_MS,
        stalledInterval: STALLED_INTERVAL_MS,
        maxStalledCount: 2,
      },
    );

    this.worker.on('completed', (job) => {
      console.log(`[ONBOARDING-QUEUE] Job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[ONBOARDING-QUEUE] Job ${job?.id} failed:`, err);
    });
    console.log('[ONBOARDING-QUEUE] Worker started');
  }
