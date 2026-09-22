/**
 * BullMQ queue for the /extractions/batch flow.
 *
 * The HTTP handler uploads each file to configured storage, persists a FileExtraction
 * record per file, then enqueues one job per file here. The worker
 * downloads the file from storage, runs OCR/LLM, updates the DB,
 * and streams progress over Socket.IO.
 *
 * Concurrency is configurable via BATCH_EXTRACTION_CONCURRENCY (default 3).
 */
import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.connection';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
} from '../utils/redis-compression.util';
import { createBatchExtractionOrchestrator } from '../services/extraction/batch-extraction-orchestrator-factory';
import { type BatchExtractionCategory } from '../../domain/dtos/file-extraction.dto';
import { FileService } from '../services/FileService';

export interface BatchExtractionJobData {
  readonly extractionId: string;
  readonly batchId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly companyId: string;
  readonly userCategory: BatchExtractionCategory;
  readonly fileUrl?: string;
  readonly fileBuffer?: Buffer | { type: 'Buffer'; data: number[] };
}

const QUEUE_NAME = 'batch-extraction';
const LOG_TAG = '[BATCH-EXTRACTION]';
const DEFAULT_CONCURRENCY = 3;

function resolveConcurrency(): number {
  const raw = process.env.BATCH_EXTRACTION_CONCURRENCY;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

export class BatchExtractionQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async addJob(data: BatchExtractionJobData): Promise<string> {
    const compressed = compressIfNeeded(data);
    const job = await this.queue.add('extract-file', compressed, {
      removeOnComplete: { age: 3600, count: 200 },
      removeOnFail: { age: 24 * 3600, count: 1000 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
    return job.id!;
  }

  startWorker(): void {
    if (this.worker) {
      console.log(`${LOG_TAG} Worker already running`);
      return;
    }
    const connection = getRedisConnection();
    const concurrency = resolveConcurrency();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<BatchExtractionJobData>>) => processBatchExtractionJob(job),
      {
        connection,
        concurrency,
        lockDuration: 30 * 60 * 1000,
        lockRenewTime: 5 * 60 * 1000,
      },
    );
    this.worker.on('completed', (job) => console.log(`${LOG_TAG} Job ${job.id} completed`));
    this.worker.on('failed', (job, err) => console.error(`${LOG_TAG} Job ${job?.id} failed:`, err));
    console.log(`${LOG_TAG} Worker started with concurrency=${concurrency}`);
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log(`${LOG_TAG} Worker stopped`);
    }
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

let queueInstance: BatchExtractionQueue | null = null;

export function getBatchExtractionQueue(): BatchExtractionQueue {
  if (!queueInstance) {
    queueInstance = new BatchExtractionQueue();
    if (shouldStartQueueWorkers()) queueInstance.startWorker();
  }
  return queueInstance;
}

async function processBatchExtractionJob(
  job: Job<CompressedData<BatchExtractionJobData>>,
): Promise<void> {
  const data = decompressIfNeeded(job.data);
  const buffer = await resolveJobBuffer(data);
  const orchestrator = createBatchExtractionOrchestrator();
  await orchestrator.processQueuedFile({
    fileBuffer: buffer,
    fileName: data.fileName,
    mimeType: data.mimeType,
    extractionId: data.extractionId,
    batchId: data.batchId,
    companyId: data.companyId,
    userCategory: data.userCategory,
  });
}

async function resolveJobBuffer(data: BatchExtractionJobData): Promise<Buffer> {
  if (data.fileBuffer) {
    return Buffer.isBuffer(data.fileBuffer) ? data.fileBuffer : Buffer.from(data.fileBuffer.data);
  }
  if (!data.fileUrl) {
    throw new Error(`Batch extraction job ${data.extractionId} is missing fileUrl`);
  }
  const file = await new FileService().getFileFromUrl(data.fileUrl);
  return file.buffer;
}
