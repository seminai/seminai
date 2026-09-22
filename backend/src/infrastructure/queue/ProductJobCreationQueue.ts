import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
  calculateSizeInMB,
} from '../utils/redis-compression.util';
import { PrismaDosageAgentJobRepository } from '../repositories/PrismaDosageAgentJobRepository';
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
import {
  ProductionUnitMatcherService,
  UnmatchedProductWarning,
} from '../../application/services/ProductionUnitMatcherService';
import {
  BulkCreateProductAndJobUseCase,
  BulkCreateJobItemDTO,
} from '../../application/use-cases/job/BulkCreateProductAndJobUseCase';
import { GetLabelTextProvider } from '../services/tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../services/tool/extractLabel.adapter';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';

const LOCK_DURATION_MS = 300_000; // 5 minuti
const LOCK_RENEW_TIME_MS = 60_000; // 1 minuto
const STALLED_INTERVAL_MS = 60_000; // 1 minuto

const QUEUE_NAME = 'product-job-creation';

/**
 * Dati del job per la creazione prodotti/interventi
 */
export interface ProductJobCreationJobData {
  readonly items: BulkCreateJobItemDTO[];
  readonly userId: string;
}

/**
 * Risultato del job di creazione prodotti/interventi
 */
export interface ProductJobCreationJobResult {
  readonly jobs: unknown[];
  readonly jobProductLinks: unknown[];
  readonly warnings: UnmatchedProductWarning[];
}

const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);

type ProductJobCreationJobReturnValue =
  | ProductJobCreationJobResult
  | CompressedData<ProductJobCreationJobResult>;

export class ProductJobCreationQueue {
  public readonly queue: Queue;
  public queueEvents: QueueEvents | null = null;
  public worker: Worker | null = null;
  private readonly activeJobTokens: Map<string, string>;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.queueEvents = new QueueEvents(QUEUE_NAME, { connection });
    this.queueEvents.on('stalled', ({ jobId }) => {
      console.warn(`[PRODUCT-JOB-QUEUE] QueueEvents detected stalled job ${jobId}`);
    });
    void this.queueEvents
      .waitUntilReady()
      .then(() => console.log('[PRODUCT-JOB-QUEUE] QueueEvents ready'))
      .catch((error: unknown) => console.error('[PRODUCT-JOB-QUEUE] QueueEvents error:', error));
    this.activeJobTokens = new Map();
  }

  /**
   * Aggiunge un job alla coda
   */
  async addJob(data: ProductJobCreationJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[PRODUCT-JOB-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('create-product-and-job', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(
      `[PRODUCT-JOB-QUEUE] Job ${job.id} added to queue (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }

  /**
   * Ottiene lo stato di un job
   */
  async getJobStatus(jobId: string): Promise<{
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
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    const state = await job.getState();
    const progress = job.progress as number;

    let result: ProductJobCreationJobResult | undefined;
    if (job.returnvalue) {
      const returnValue = job.returnvalue as ProductJobCreationJobReturnValue;
      if (typeof returnValue === 'object' && returnValue !== null) {
        if ('compressed' in returnValue && 'data' in returnValue) {
          result = decompressIfNeeded(returnValue as CompressedData<ProductJobCreationJobResult>);
        } else {
          result = returnValue as ProductJobCreationJobResult;
        }
      }
    }

    const jobData = job.data
      ? (decompressIfNeeded(job.data) as ProductJobCreationJobData)
      : undefined;

    return {
      id: job.id!,
      state,
      progress,
      data: jobData ? { userId: jobData.userId } : undefined,
      result,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  /**
   * Avvia il worker per processare i job
   */
  startWorker(): void {
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

  /**
   * Ferma il worker
   */
  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[PRODUCT-JOB-QUEUE] Worker stopped');
    }
    if (this.queueEvents) {
      await this.queueEvents.close();
      this.queueEvents = null;
      console.log('[PRODUCT-JOB-QUEUE] QueueEvents stopped');
    }
  }

  /**
   * Chiude la coda
   */
  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

let queueInstance: ProductJobCreationQueue | null = null;

/**
 * Ottiene l'istanza singleton della coda
 */
export function getProductJobCreationQueue(): ProductJobCreationQueue {
  if (!queueInstance) {
    queueInstance = new ProductJobCreationQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}
