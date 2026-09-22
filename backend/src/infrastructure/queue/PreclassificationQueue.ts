/**
 * BullMQ queue for the /extractions/preclassify flow.
 *
 * The HTTP handler enqueues one job per uploaded file (carrying the raw buffer
 * plus the user's company list). The worker extracts text, runs the deterministic
 * VAT match + a single gpt-4o-mini classification, writes the result to Redis,
 * and streams it over Socket.IO. Best-effort: failures never block the real
 * /extractions/batch upload.
 *
 * Concurrency is configurable via PRECLASSIFY_CONCURRENCY (default 4).
 */
import { Queue, Worker, Job } from 'bullmq';
import { shouldStartQueueWorkers } from '../runtime/shouldStartQueueWorkers';
import { getRedisConnection } from './redis.connection';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
} from '../utils/redis-compression.util';
import { getGlobalSocketIO } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import {
  type CompanyMatchSource,
  type PreclassificationCompany,
  type PreclassificationResult,
} from '../../domain/dtos/preclassification.dto';
import { extractPreclassifyContext } from '../services/extraction/preclassify-text-extractor';
import {
  extractVatAndFiscalCodes,
  matchCompanyByVat,
  pickSingleCompany,
} from '../services/extraction/vat-company-matcher';
import { getDocumentPreclassifierService } from '../services/extraction/document-preclassifier.service';
import {
  getCachedResult,
  getPreclassificationStatus,
  setCachedResult,
  setItemError,
  setItemResult,
} from '../services/extraction/preclassification-store';

export interface PreclassificationJobData {
  readonly preclassId: string;
  readonly itemId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly userId: string;
  readonly fileHash: string;
  readonly companySetHash: string;
  readonly companies: readonly PreclassificationCompany[];
  readonly fileBuffer: Buffer | { type: 'Buffer'; data: number[] };
}

const QUEUE_NAME = 'document-preclassification';
const LOG_TAG = '[PRECLASSIFY]';
const DEFAULT_CONCURRENCY = 4;

function resolveConcurrency(): number {
  const raw = process.env.PRECLASSIFY_CONCURRENCY;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

export class PreclassificationQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, { connection: getRedisConnection() });
  }

  async addJob(data: PreclassificationJobData): Promise<string> {
    const job = await this.queue.add('preclassify-file', compressIfNeeded(data), {
      removeOnComplete: { age: 1800, count: 200 },
      removeOnFail: { age: 3600, count: 500 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    });
    return job.id!;
  }

  startWorker(): void {
    if (this.worker) {
      console.log(`${LOG_TAG} Worker already running`);
      return;
    }
    const concurrency = resolveConcurrency();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<PreclassificationJobData>>) =>
        processPreclassificationJob(job),
      { connection: getRedisConnection(), concurrency, lockDuration: 5 * 60 * 1000 },
    );
    this.worker.on('failed', (job, err) => console.error(`${LOG_TAG} Job ${job?.id} failed:`, err));
    console.log(`${LOG_TAG} Worker started with concurrency=${concurrency}`);
  }

  async stopWorker(): Promise<void> {
    if (!this.worker) return;
    await this.worker.close();
    this.worker = null;
  }

  async close(): Promise<void> {
    await this.stopWorker();
    await this.queue.close();
  }
}

let queueInstance: PreclassificationQueue | null = null;

export function getPreclassificationQueue(): PreclassificationQueue {
  if (!queueInstance) {
    queueInstance = new PreclassificationQueue();
    if (shouldStartQueueWorkers()) queueInstance.startWorker();
  }
  return queueInstance;
}

function toBuffer(data: PreclassificationJobData['fileBuffer']): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data.data);
}

function deterministicSource(
  vatCompanyId: string | null,
  singleCompanyId: string | null,
): {
  companyId: string | null;
  source: CompanyMatchSource;
} {
  if (vatCompanyId) return { companyId: vatCompanyId, source: 'vat_exact' };
  if (singleCompanyId) return { companyId: singleCompanyId, source: 'only_company' };
  return { companyId: null, source: 'none' };
}

async function classifyJob(data: PreclassificationJobData): Promise<PreclassificationResult> {
  const cached = await getCachedResult({
    fileHash: data.fileHash,
    companySetHash: data.companySetHash,
  });
  if (cached) return cached;
  const context = await extractPreclassifyContext({
    buffer: toBuffer(data.fileBuffer),
    mimeType: data.mimeType,
    fileName: data.fileName,
  });
  const codes = extractVatAndFiscalCodes([data.fileName, context.text].join('\n'));
  const vatMatch = matchCompanyByVat({ codes, companies: data.companies });
  const single = pickSingleCompany(data.companies);
  const deterministic = deterministicSource(vatMatch.companyId, single);
  const result = await getDocumentPreclassifierService().preclassify({
    fileName: data.fileName,
    mimeType: data.mimeType,
    text: context.text,
    companies: data.companies,
    deterministicCompanyId: deterministic.companyId,
    deterministicSource: deterministic.source,
    vatHint: vatMatch.vatHint,
    deterministicCategory: context.deterministicCategory,
    deterministicCategoryConfidence: context.categoryConfidence,
    deterministicCategoryReason: context.categoryReason,
  });
  await setCachedResult({
    fileHash: data.fileHash,
    companySetHash: data.companySetHash,
    result,
  });
  return result;
}

function emitItem(data: PreclassificationJobData, result: PreclassificationResult): void {
  getGlobalSocketIO()?.to(`preclassify:${data.preclassId}`).emit('preclassify:item', {
    preclassId: data.preclassId,
    itemId: data.itemId,
    fileName: data.fileName,
    documentCategory: result.documentCategory,
    categoryConfidence: result.categoryConfidence,
    companyId: result.companyId,
    companyConfidence: result.companyConfidence,
    status: 'classified',
  });
}

async function maybeEmitDone(preclassId: string): Promise<void> {
  const status = await getPreclassificationStatus(preclassId);
  if (!status || status.items.some((item) => item.status === 'pending')) return;
  getGlobalSocketIO()?.to(`preclassify:${preclassId}`).emit('preclassify:done', { preclassId });
}

async function processPreclassificationJob(
  job: Job<CompressedData<PreclassificationJobData>>,
): Promise<void> {
  const data = decompressIfNeeded(job.data);
  try {
    const result = await classifyJob(data);
    await setItemResult({
      preclassId: data.preclassId,
      itemId: data.itemId,
      fileName: data.fileName,
      result,
    });
    emitItem(data, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preclassification failed';
    await setItemError({
      preclassId: data.preclassId,
      itemId: data.itemId,
      fileName: data.fileName,
      error: message,
    });
    getGlobalSocketIO()?.to(`preclassify:${data.preclassId}`).emit('preclassify:item:error', {
      preclassId: data.preclassId,
      itemId: data.itemId,
      fileName: data.fileName,
      error: message,
    });
  } finally {
    await maybeEmitDone(data.preclassId);
  }
}
