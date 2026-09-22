import { Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { compressIfNeeded, decompressIfNeeded, CompressedData, calculateSizeInMB } from '../utils/redis-compression.util';
import { PrismaJobRepository } from '../repositories/PrismaJobRepository';
import { PrismaStockRepository } from '../repositories/PrismaStockRepository';
import { PrismaProductRepository } from '../repositories/PrismaProductRepository';
import { PrismaProductionUnitRepository } from '../repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../repositories/PrismaFieldRepository';
import { PrismaWarehouseRepository } from '../repositories/PrismaWarehouseRepository';
import { PrismaLabelExtractionRepository } from '../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../repositories/Prisma';
import { DosageAgentJobState } from '../../domain/entities/DosageAgentJob';
import { DosageLoggerService } from '../services/dosage-logger.service';
import { ProductionUnitMatcherService } from '../../application/services/ProductionUnitMatcherService';
import { BulkCreateProductAndJobUseCase } from '../../application/use-cases/job/BulkCreateProductAndJobUseCase';
import { GetLabelTextProvider } from '../services/tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../services/tool/extractLabel.adapter';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';
import { LOCK_DURATION_MS, LOCK_RENEW_TIME_MS, STALLED_INTERVAL_MS, QUEUE_NAME, ProductJobCreationJobData, ProductJobCreationJobResult, dosageAgentJobRepository } from './product-job-creation-queue.support';
import type { ProductJobCreationQueueContext } from './product-job-creation-queue.context';

export function productJobCreationQueueStartWorker(this: ProductJobCreationQueueContext): void {
    if (this.worker) {
      console.log('[PRODUCT-JOB-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<ProductJobCreationJobData>>) => {
        console.log(`[PRODUCT-JOB-QUEUE] Processing job ${job.id}`);
        try {
          await job.updateProgress(0);
          const jobData = decompressIfNeeded(job.data);
          const { items, userId } = jobData;
          const jobId = job.id ? String(job.id) : '';

          const userExists = await ensureUserOrSkip(userId, prisma, {
            jobId: job.id,
            queueName: QUEUE_NAME,
          });
          if (!userExists) {
            return skippedJobResult(`user ${userId} no longer exists`);
          }

          // Aggiorna stato a ACTIVE
          try {
            await dosageAgentJobRepository.updateStatus({
              jobId,
              userId,
              state: DosageAgentJobState.ACTIVE,
              progress: 0,
              failedReason: null,
              processedOn: new Date(),
              finishedOn: null,
              name: 'Creazione Interventi',
            });
          } catch (error) {
            console.error(
              `[PRODUCT-JOB-QUEUE] Failed to persist ACTIVE status for job ${job.id}:`,
              error,
            );
          }

          await job.updateProgress(5);

          const logger = DosageLoggerService.getInstance();
          logger.logInfo({
            jobId,
            userId,
            message: `Avvio creazione interventi: ${items.length} elementi da processare`,
          });

          // Step 1: Risoluzione unità produttive (la parte lenta)
          const matcher = new ProductionUnitMatcherService(
            new PrismaProductionUnitRepository(prisma),
            new PrismaProductRepository(prisma),
            new PrismaLabelExtractionRepository(prisma),
            new GetLabelTextProvider(),
            new ExtractLabelAdapter(),
          );

          logger.logInfo({
            jobId,
            userId,
            message: 'Risoluzione unità produttive in corso...',
          });

          const context = { jobId, userId };
          const resolved = await matcher.resolveItems(items, userId, context, async (p) => {
            await job.updateProgress(p);
          });
          await job.updateProgress(60);

          logger.logInfo({
            jobId,
            userId,
            message: `Risoluzione completata: ${resolved.resolvedItems.length} elementi risolti, ${resolved.warnings.length} warnings`,
          });

          let resultJobs: unknown[] = [];
          let jobProductLinks: unknown[] = [];

          if (resolved.resolvedItems.length > 0) {
            // Step 2: Creazione job e prodotti
            const jobRepo = new PrismaJobRepository(prisma);
            const useCase = new BulkCreateProductAndJobUseCase(
              jobRepo,
              new PrismaStockRepository(prisma),
              new PrismaProductRepository(prisma),
              new PrismaProductionUnitRepository(prisma),
              new PrismaFieldRepository(prisma),
              new PrismaWarehouseRepository(prisma),
            );

            logger.logInfo({
              jobId,
              userId,
              message: 'Creazione interventi nel database...',
            });

            const { jobs: createdJobs } = await useCase.execute({
              items: resolved.resolvedItems,
            });
            resultJobs = createdJobs;
            await job.updateProgress(90);

            // Step 3: Fetch job-product links
            jobProductLinks = await jobRepo.findManyByIdsWithProducts(createdJobs.map((j) => j.id));
          }

          await job.updateProgress(100);

          // Aggiorna stato a COMPLETED
          try {
            await dosageAgentJobRepository.updateStatus({
              jobId,
              userId,
              state: DosageAgentJobState.COMPLETED,
              progress: 100,
              failedReason: null,
              finishedOn: new Date(),
            });
          } catch (error) {
            console.error(
              `[PRODUCT-JOB-QUEUE] Failed to persist COMPLETED status for job ${job.id}:`,
              error,
            );
          }

          logger.logCompletion({
            jobId,
            userId,
            message: `Creazione interventi completata: ${resultJobs.length} interventi creati`,
            metadata: {
              jobsCreated: resultJobs.length,
              warnings: resolved.warnings.length,
            },
          });

          const result: ProductJobCreationJobResult = {
            jobs: resultJobs,
            jobProductLinks,
            warnings: resolved.warnings,
          };

          const resultSize = calculateSizeInMB(result);
          console.log(`[PRODUCT-JOB-QUEUE] Job ${job.id} result size: ${resultSize.toFixed(2)}MB`);
          return compressIfNeeded(result);
        } catch (error) {
          console.error(`[PRODUCT-JOB-QUEUE] Job ${job.id} failed:`, error);
          try {
            const errorJobData = decompressIfNeeded(job.data);
            const errorJobId = job.id ? String(job.id) : '';
            const errorLogger = DosageLoggerService.getInstance();
            errorLogger.logError({
              jobId: errorJobId,
              userId: errorJobData.userId,
              message: `Creazione interventi fallita: ${error instanceof Error ? error.message : String(error)}`,
              error: error instanceof Error ? error : undefined,
            });
            await dosageAgentJobRepository.updateStatus({
              jobId: errorJobId,
              userId: errorJobData.userId,
              state: DosageAgentJobState.FAILED,
              progress: 0,
              failedReason: error instanceof Error ? error.message : String(error),
              finishedOn: new Date(),
            });
          } catch (persistError) {
            console.error(
              `[PRODUCT-JOB-QUEUE] Failed to persist FAILED status for job ${job.id}:`,
              persistError,
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
    this.worker.on('active', (job) => {
      if (job.id && job.token) {
        this.activeJobTokens.set(job.id, job.token);
      }
    });
    this.worker.on('completed', (job) => {
      console.log(`[PRODUCT-JOB-QUEUE] Job ${job.id} completed`);
      if (job?.id) {
        this.activeJobTokens.delete(job.id);
      }
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[PRODUCT-JOB-QUEUE] Job ${job?.id} failed with error:`, err);
      if (job?.id) {
        this.activeJobTokens.delete(job.id);
      }
    });
    console.log('[PRODUCT-JOB-QUEUE] Worker started');
  }
