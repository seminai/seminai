import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { LlmJobType } from '@prisma/client';
import { PrismaLabelExtractionRepository } from '../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../repositories/Prisma';
import { GetLabelTextFromUrlProvider } from '../services/tool/getLabelTextFromUrl.provider';
import { ExtractFertilizerLabelAdapter } from '../services/tool/extractFertilizerLabel.adapter';
import { FileUploadAdapter } from '../services/tool/fileUpload.adapter';
import { BulkExtractFertilizerLabelsFromPdfFilesUseCase } from '../../application/use-cases/label/BulkExtractFertilizerLabelsFromPdfFilesUseCase';
import {
  LangChainUsageCollector,
  UsageAccumulator,
  CostCalculator,
  OpenAiPricingRegistry,
} from '../services/llm_costs/usage';
import { PrismaUserRepository } from '../repositories/PrismaUserRepository';
import { DeductUserCreditsUseCase } from '../../application/use-cases/user/DeductUserCreditsUseCase';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
  calculateSizeInMB,
} from '../utils/redis-compression.util';
import { FertilizerLabel } from '../../domain/dtos/fertilizer-label.dto';
import { ensureUserOrSkip, skippedJobResult } from './helpers/userGuard';

export interface FertilizerLabelExtractionJobData {
  files: Array<{
    fileName: string;
    pdfBuffer: Buffer | { type: 'Buffer'; data: number[] };
  }>;
  userId: string;
  concurrency?: number;
}

export interface FertilizerLabelExtractionJobResult {
  results: ReadonlyArray<{
    fileName: string;
    status: 'extracted' | 'failed';
    bucketUrl?: string;
    label?: FertilizerLabel;
    error?: string;
  }>;
  cost: {
    inputTokens: number;
    outputTokens: number;
    mistralOcrPages: number;
    totalCostUsd: number;
    costWithMarginUsd: number;
  };
}

const QUEUE_NAME = 'fertilizer-label-extraction';

export class FertilizerLabelExtractionQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async addJob(data: FertilizerLabelExtractionJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`[FERTILIZER-QUEUE] Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);
    const job = await this.queue.add('extract-fertilizer-labels', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(
      `[FERTILIZER-QUEUE] Job ${job.id} added to queue (compressed: ${compressedData.compressed})`,
    );
    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    data?: {
      filesCount: number;
      fileNames: string[];
      userId: string;
      concurrency?: number;
    };
    result?: FertilizerLabelExtractionJobResult;
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
    return {
      id: job.id!,
      state,
      progress,
      data: job.data
        ? {
            filesCount: job.data.files?.length ?? 0,
            fileNames: job.data.files?.map((f: { fileName: string }) => f.fileName) ?? [],
            userId: job.data.userId,
            concurrency: job.data.concurrency,
          }
        : undefined,
      result: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  startWorker(): void {
    if (this.worker) {
      console.log('[FERTILIZER-QUEUE] Worker already running');
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<FertilizerLabelExtractionJobData>>) => {
        console.log(`[FERTILIZER-QUEUE] Processing job ${job.id}`);
        try {
          await job.updateProgress(0);
          const jobData = decompressIfNeeded(job.data);
          console.log(`[FERTILIZER-QUEUE] Job data decompressed, files: ${jobData.files.length}`);
          const userExists = await ensureUserOrSkip(jobData.userId, prisma, {
            jobId: job.id,
            queueName: QUEUE_NAME,
          });
          if (!userExists) {
            return skippedJobResult(`user ${jobData.userId} no longer exists`);
          }
          const repo = new PrismaLabelExtractionRepository(prisma);
          const textProvider = new GetLabelTextFromUrlProvider();
          const extractor = new ExtractFertilizerLabelAdapter();
          const fileService = new FileUploadAdapter();
          const useCase = new BulkExtractFertilizerLabelsFromPdfFilesUseCase(
            repo,
            textProvider,
            extractor,
            fileService,
          );
          const usage = new UsageAccumulator();
          const collector = new LangChainUsageCollector(usage);
          const model = process.env.OPENAI_MODEL || 'gpt-4o';
          const pricing = OpenAiPricingRegistry.getPricing(model);
          const fileInputs = jobData.files.map((file) => ({
            fileName: file.fileName,
            pdfBuffer: Buffer.isBuffer(file.pdfBuffer)
              ? file.pdfBuffer
              : Buffer.from(file.pdfBuffer.data),
          }));
          await job.updateProgress(10);
          const outcome = await useCase.execute({
            files: fileInputs,
            userId: jobData.userId,
            concurrency: jobData.concurrency,
            callbacks: [collector],
            usageAccumulator: usage,
            context: {
              jobId: String(job.id ?? 'unknown-job'),
              jobGroupId: String(job.id ?? 'unknown-group'),
              userId: jobData.userId,
              jobType: LlmJobType.LABEL,
            },
          });
          await job.updateProgress(95);
          const tokens = usage.getTotals();
          const mistralOcrPages = usage.getMistralOcrPages();
          const cost = CostCalculator.computeCost({
            tokens,
            pricing,
            mistralOcrPages,
            margin: 0.2,
          });
          const userRepository = new PrismaUserRepository(prisma);
          const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
          try {
            await deductCreditsUseCase.execute({
              userId: jobData.userId,
              amount: cost.costWithMarginUsd,
            });
            console.log(
              `[FERTILIZER-QUEUE] Deducted ${cost.costWithMarginUsd} credits from user ${jobData.userId}`,
            );
          } catch (error) {
            console.error('[FERTILIZER-QUEUE] Failed to deduct credits (non-fatal):', error);
          }
          await job.updateProgress(100);
          console.log(`[FERTILIZER-QUEUE] Job ${job.id} completed successfully`);
          return {
            results: outcome.results,
            cost: {
              inputTokens: cost.tokens.promptTokens,
              outputTokens: cost.tokens.completionTokens,
              mistralOcrPages: cost.mistralOcrPages,
              totalCostUsd: cost.totalCostUsd,
              costWithMarginUsd: cost.costWithMarginUsd,
            },
          };
        } catch (error) {
          console.error(`[FERTILIZER-QUEUE] Job ${job.id} failed:`, error);
          throw error;
        }
      },
      {
        connection,
        concurrency: 1,
      },
    );
    this.worker.on('completed', (job) => {
      console.log(`[FERTILIZER-QUEUE] Job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      console.error(`[FERTILIZER-QUEUE] Job ${job?.id} failed with error:`, err);
    });
    console.log('[FERTILIZER-QUEUE] Worker started');
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[FERTILIZER-QUEUE] Worker stopped');
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

let queueInstance: FertilizerLabelExtractionQueue | null = null;

export function getFertilizerLabelExtractionQueue(): FertilizerLabelExtractionQueue {
  if (!queueInstance) {
    queueInstance = new FertilizerLabelExtractionQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}
