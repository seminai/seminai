/**
 * BullMQ queue for async PDF extraction within agent chat.
 * Offloads heavy PDF processing (OCR + LLM) so the agent stream
 * can return immediately without hitting the 5-min timeout.
 *
 * On completion the worker writes results into the in-process working
 * memory and notifies the frontend via Socket.IO.
 */
import { Queue, Worker, Job } from 'bullmq';
import { DocumentCategory } from '@prisma/client';
import { getRedisConnection } from './redis.connection';
import { PianoColturalePdfAgent } from '../services/agents/file_agent/piano_colturale_pdf_agent';
import { DocumentExtractionOrchestrator } from '../services/extraction/document-extraction-orchestrator';
import { pdfToText } from '../services/ocr/pdfToText';
import { resolveFileCategory } from '../services/extraction/file-category-resolver';
import { mapPdfExtractionRoute } from '../services/extraction/pdf-extraction-router';
import { getDocumentCategoryMeta } from '../../domain/dtos/document-category.dto';
import {
  writeExtractionCompletedMessage,
  writeExtractionFailedMessage,
} from './chat-extraction-message-writer';
import { autoPresentExtractionReview } from './auto-present-extraction-review';
import {
  writeTempFile,
  cleanupTempFile,
} from '../services/agents/dosage_agent_react/tools/temp-file-utils';
import {
  compressIfNeeded,
  decompressIfNeeded,
  CompressedData,
  calculateSizeInMB,
} from '../utils/redis-compression.util';
import {
  updateWorkingMemory,
  getWorkingMemory,
} from '../services/agents/dosage_agent_react/working-memory';
import { createChatEmitter } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import type {
  FieldExtracted,
  ProductionUnitExtracted,
  StockPreviewEntry,
} from '../services/agents/dosage_agent_react/tools/file-extraction-types';

// ── Interfaces ──

export interface ChatExtractionJobData {
  readonly threadId: string;
  readonly fileBuffer: Buffer | { type: 'Buffer'; data: number[] };
  readonly fileName: string;
  readonly mimeType: string;
  readonly userId?: string;
  readonly mentions?: ReadonlyArray<{ type: string; id: string; label: string }>;
}

export interface ChatExtractionJobResult {
  readonly status: 'completed' | 'failed';
  readonly detectedFileType: 'agricultural' | 'invoice' | 'ddt';
  readonly documentCategory: DocumentCategory;
  /** JSON string identical to what the sync tool used to return */
  readonly toolResponse: string;
}

const QUEUE_NAME = 'chat-extraction';
const LOG_TAG = '[CHAT-EXTRACTION]';

// ── Queue class ──

export class ChatExtractionQueue {
  public readonly queue: Queue;
  public worker: Worker | null = null;

  constructor() {
    const connection = getRedisConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async addJob(data: ChatExtractionJobData): Promise<string> {
    const dataSize = calculateSizeInMB(data);
    console.log(`${LOG_TAG} Job data size: ${dataSize.toFixed(2)}MB`);
    const compressedData = compressIfNeeded(data);

    const job = await this.queue.add('extract-pdf-chat', compressedData, {
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 7200, count: 500 },
      attempts: 1,
    });
    console.log(`${LOG_TAG} Job ${job.id} added to queue`);
    return job.id!;
  }

  async getJobStatus(jobId: string): Promise<{
    id: string;
    state: string;
    progress: number;
    message?: string;
    result?: ChatExtractionJobResult;
    failedReason?: string;
  }> {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const state = await job.getState();
    let progress = 0;
    let message: string | undefined;

    const rawProgress = job.progress;
    if (typeof rawProgress === 'object' && rawProgress !== null) {
      const obj = rawProgress as { percent?: number; message?: string };
      progress = obj.percent ?? 0;
      message = obj.message;
    } else {
      progress = typeof rawProgress === 'number' ? rawProgress : 0;
    }

    return {
      id: job.id!,
      state,
      progress,
      message,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  startWorker(): void {
    if (this.worker) {
      console.log(`${LOG_TAG} Worker already running`);
      return;
    }
    const connection = getRedisConnection();
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job<CompressedData<ChatExtractionJobData>>) => {
        return processChatExtraction(job);
      },
      { connection, concurrency: 1, lockDuration: 20 * 60 * 1000, lockRenewTime: 4 * 60 * 1000 },
    );

    this.worker.on('completed', (job) => console.log(`${LOG_TAG} Job ${job.id} completed`));
    this.worker.on('failed', (job, err) => console.error(`${LOG_TAG} Job ${job?.id} failed:`, err));
    console.log(`${LOG_TAG} Worker started`);
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

// ── Singleton ──

let queueInstance: ChatExtractionQueue | null = null;

export function getChatExtractionQueue(): ChatExtractionQueue {
  if (!queueInstance) {
    queueInstance = new ChatExtractionQueue();
    queueInstance.startWorker();
  }
  return queueInstance;
}

// ── Worker logic (extracted to stay under 300 lines) ──

async function processChatExtraction(
  job: Job<CompressedData<ChatExtractionJobData>>,
): Promise<ChatExtractionJobResult> {
  const jobData = decompressIfNeeded(job.data);
  const { threadId, fileName } = jobData;
  const emitter = createChatEmitter(threadId);
  const emitProgress = (percent: number, msg: string) => {
    job.updateProgress({ percent, message: msg }).catch(() => {});
    emitter?.emitExtractionProgress(job.id!, percent, msg);
  };

  // Reset WM TTL so it doesn't expire during long extraction
  getWorkingMemory(threadId);

  try {
    const buffer = Buffer.isBuffer(jobData.fileBuffer)
      ? jobData.fileBuffer
      : Buffer.from(jobData.fileBuffer.data);

    emitProgress(5, 'Estrazione testo dal PDF...');
    const { text } = await pdfToText(buffer);

    emitProgress(15, 'Classificazione documento...');
    const resolved = await resolveFileCategory({
      userCategory: 'auto',
      fileBuffer: buffer,
      mimeType: jobData.mimeType,
      fileName,
      pdfText: text,
    });
    const routing = mapPdfExtractionRoute(resolved);
    const documentCategory = routing.documentCategory;
    const detection = {
      type: routing.detectedFileType,
      reason: routing.reason,
    };

    if (routing.route === 'commercial') {
      return await processCommercialDocumentPdf(
        job,
        threadId,
        new Uint8Array(buffer),
        fileName,
        detection,
        emitProgress,
        documentCategory,
        jobData.userId,
        jobData.mentions,
      );
    }

    // Piano Colturale (or unknown → fallback)
    return await processPianoColturalePdf(
      job,
      threadId,
      buffer,
      fileName,
      detection,
      emitProgress,
      documentCategory,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`${LOG_TAG} Job ${job.id} failed:`, error);
    updateWorkingMemory(threadId, {
      pendingExtractionJobId: undefined,
      pendingExtractionFailure: {
        jobId: job.id!,
        errorMessage: msg,
        failedAt: Date.now(),
      },
    });
    emitter?.emitExtractionFailed(job.id!, msg);
    await writeExtractionFailedMessage({
      threadId,
      fileName,
      extractionError: msg,
      extractionJobId: job.id!,
    });
    throw error;
  }
}

async function processPianoColturalePdf(
  job: Job,
  threadId: string,
  buffer: Buffer,
  fileName: string,
  detection: { type: string; reason: string },
  emitProgress: (percent: number, msg: string) => void,
  documentCategory: DocumentCategory,
): Promise<ChatExtractionJobResult> {
  emitProgress(30, 'Estrazione Piano Colturale...');

  const pdfAgent = new PianoColturalePdfAgent();
  const result = await pdfAgent.extractFromPdf(buffer, (chunkIndex, totalChunks) => {
    const done = chunkIndex + 1;
    const pct = Math.round(30 + (done / totalChunks) * 55);
    emitProgress(pct, `Elaborazione chunk ${done}/${totalChunks}...`);
  });

  const fields: FieldExtracted[] = result.fields.fields ?? [];
  const productionUnits: ProductionUnitExtracted[] = result.productionUnits.units ?? [];

  emitProgress(90, 'Salvataggio risultati...');

  // Write to working memory (same keys the sync code used)
  const wm = getWorkingMemory(threadId);
  if (wm.pendingExtractionJobId === job.id) {
    updateWorkingMemory(threadId, {
      extractedFileData: { companies: [], fields, productionUnits },
      detectedFileType: 'agricultural',
      pendingExtractionJobId: undefined,
      pendingExtractionFileName: undefined,
    });
  }

  const toolResponse = buildPianoColturaleResponse(
    fields,
    productionUnits,
    fileName,
    detection.reason,
    documentCategory,
  );

  emitProgress(100, 'Completato');
  const summary = `Estratti ${fields.length} campi e ${productionUnits.length} UP da "${fileName}"`;
  const emitter = createChatEmitter(threadId);
  emitter?.emitExtractionComplete(job.id!, summary, { documentCategory });
  await writeExtractionCompletedMessage({ threadId, fileName, documentCategory, summary });

  return { status: 'completed', detectedFileType: 'agricultural', documentCategory, toolResponse };
}

async function processCommercialDocumentPdf(
  job: Job,
  threadId: string,
  buffer: Uint8Array,
  fileName: string,
  detection: { type: string; reason: string },
  emitProgress: (percent: number, msg: string) => void,
  documentCategory: DocumentCategory,
  userId: string | undefined,
  mentions: ReadonlyArray<{ type: string; id: string; label: string }> | undefined,
): Promise<ChatExtractionJobResult> {
  const detectedType: 'invoice' | 'ddt' = detection.type === 'ddt' ? 'ddt' : 'invoice';
  emitProgress(30, detectedType === 'ddt' ? 'Estrazione DDT...' : 'Estrazione fattura...');
  const tempPath = writeTempFile(buffer, fileName);
  try {
    const orchestrator = new DocumentExtractionOrchestrator();
    const { stockEntries: readonlyStockEntries, needsReviewCount } = await orchestrator.execute({
      kind: detectedType,
      filePath: tempPath,
    });
    const stockEntries: StockPreviewEntry[] = [...readonlyStockEntries];

    emitProgress(80, 'Normalizzazione prodotti...');

    const wm = getWorkingMemory(threadId);
    if (wm.pendingExtractionJobId === job.id) {
      updateWorkingMemory(threadId, {
        extractedStockData: stockEntries,
        detectedFileType: detectedType,
        pendingExtractionJobId: undefined,
        pendingExtractionFileName: undefined,
      });
    }

    const prefix = detectedType === 'ddt' ? 'DDT - ' : '';
    const toolResponse = buildInvoiceResponse(
      stockEntries,
      fileName,
      prefix + detection.reason,
      detectedType,
      needsReviewCount,
      documentCategory,
    );

    emitProgress(100, 'Completato');
    const reviewSuffix = needsReviewCount > 0 ? ` (${needsReviewCount} da rivedere)` : '';
    const summary = `Estratti ${stockEntries.length} prodotti da "${fileName}"${reviewSuffix}`;
    const emitter = createChatEmitter(threadId);
    emitter?.emitExtractionComplete(job.id!, summary, { documentCategory });

    // Auto-present the review form to the user without going through the agent
    // ReAct loop, when the company can be resolved deterministically.
    let presentedAutomatically = false;
    let autoReviewId: string | undefined;
    if (userId) {
      const autoResult = await autoPresentExtractionReview({
        threadId,
        userId,
        fileName,
        documentCategory,
        stockEntries,
        mentions,
      });
      presentedAutomatically = autoResult.presented;
      autoReviewId = autoResult.reviewId;
    }

    await writeExtractionCompletedMessage({
      threadId,
      fileName,
      documentCategory,
      summary,
      formAlreadyPresented: presentedAutomatically,
      extractionReviewId: autoReviewId,
    });

    return {
      status: 'completed',
      detectedFileType: detectedType,
      documentCategory,
      toolResponse,
    };
  } finally {
    cleanupTempFile(tempPath);
  }
}

// ── Response builders (match the old sync format exactly) ──

function buildPianoColturaleResponse(
  fields: readonly FieldExtracted[],
  productionUnits: readonly ProductionUnitExtracted[],
  fileName: string,
  detectionReason: string,
  documentCategory: DocumentCategory,
): string {
  const campi = fields.map((f, i) => ({
    n: i + 1,
    nome: f.nome || f.name || `F${f.foglio ?? '?'} P${f.particella ?? '?'}`,
    foglio: f.foglio ?? '?',
    particella: f.particella ?? '?',
    sezione: f.sezione ?? '',
    superficieHa: f.superficieCatastaleHa ?? f.sauHa ?? null,
    comune: f.comune ?? 'N/A',
    uso: f.usiSuolo?.join(', ') ?? f.qualita ?? '',
  }));

  const unitaProduttive = productionUnits.map((pu, i) => {
    const cycle = pu.cycles?.[0];
    const campo =
      pu.foglio && pu.particella
        ? `F${pu.foglio} P${pu.particella}`
        : pu.allocations?.[0]
          ? `F${pu.allocations[0].foglio ?? '?'} P${pu.allocations[0].particella ?? '?'}`
          : 'N/A';
    return {
      n: i + 1,
      nome: pu.name || 'N/A',
      coltura: cycle?.cropName ?? 'N/A',
      varieta: cycle?.variety ?? '',
      superficieHa: pu.areaHa ?? null,
      campoAssociato: campo,
      dataInizio: pu.startDate || cycle?.startDate || 'N/A',
      dataFine: pu.endDate || cycle?.endDate || 'N/A',
    };
  });

  const categoryMeta = getDocumentCategoryMeta(documentCategory);
  return JSON.stringify({
    source: 'PDF (Piano Colturale)',
    detectedFileType: 'agricultural',
    detectionReason,
    fileName,
    documentCategory,
    documentCategoryLabel: categoryMeta.labelIt,
    fieldsExtracted: fields.length,
    productionUnitsExtracted: productionUnits.length,
    campi,
    unitaProduttive,
    workingMemoryKey: 'extractedFileData',
    importTool: 'import_from_file',
    message: `Estratti ${fields.length} campi e ${productionUnits.length} unità produttive da "${fileName}" (categoria: ${categoryMeta.labelIt}). Presenta i campi in tabella e chiedi conferma prima di procedere.`,
  });
}

function buildInvoiceResponse(
  stockEntries: readonly StockPreviewEntry[],
  fileName: string,
  detectionReason: string,
  detectedType: 'invoice' | 'ddt',
  needsReviewCount: number,
  documentCategory: DocumentCategory,
): string {
  const preview = stockEntries
    .slice(0, 10)
    .map(
      (s) =>
        `${s.name} - ${s.stock.quantity} ${s.stock.unitOfMeasureQuantity} (${s.stock.companySupplierName ?? 'N/A'})`,
    );

  const label = detectedType === 'ddt' ? 'DDT' : 'Fattura';
  const reviewNote =
    needsReviewCount > 0
      ? ` ${needsReviewCount} righe richiedono revisione (unità di misura, quantità o coerenza prezzo).`
      : '';

  const categoryMeta = getDocumentCategoryMeta(documentCategory);
  const reviewSeed = buildReviewSeed(stockEntries, documentCategory);

  return JSON.stringify({
    source: `PDF (${label})`,
    detectedFileType: detectedType,
    detectionReason,
    fileName,
    documentCategory,
    documentCategoryLabel: categoryMeta.labelIt,
    productsExtracted: stockEntries.length,
    needsReviewCount,
    preview: { products: preview },
    workingMemoryKey: 'extractedStockData',
    nextTool: 'present_extraction_review',
    reviewSeed,
    message:
      `Estratti ${stockEntries.length} prodotti da "${fileName}" (categoria: ${categoryMeta.labelIt}).${reviewNote} ` +
      `PROSSIMO PASSO OBBLIGATORIO: dopo aver risolto l'azienda (mention o list_user_companies), chiama present_extraction_review con ` +
      `category="${documentCategory}", fileName="${fileName}", companyId=<id>, e extractedData uguale al campo reviewSeed di questo JSON. ` +
      `NON chiamare import_stock_from_file: il salvataggio avviene tramite il form di revisione + archivio.`,
  });
}

/**
 * Builds the seed payload for present_extraction_review from extracted stock entries.
 * Maps the legacy stock-shaped extraction into the per-category review schema (FATTURA/DDT).
 */
function buildReviewSeed(
  stockEntries: readonly StockPreviewEntry[],
  documentCategory: DocumentCategory,
): Record<string, unknown> {
  const first = stockEntries[0];
  if (!first) return {};
  const supplier = first.stock.companySupplierName ?? '';
  const totalLines = stockEntries.length;
  if (documentCategory === 'DDT') {
    return {
      ddtNumber: first.stock.ddtCode ?? '',
      ddtDate: first.stock.ddtDate ?? '',
      supplierName: supplier,
      totalLines,
    };
  }
  if (documentCategory === 'FATTURA') {
    return {
      invoiceNumber: first.stock.invoiceCode ?? first.stock.ddtCode ?? '',
      invoiceDate: first.stock.ddtDate ?? '',
      supplierName: supplier,
      totalLines,
    };
  }
  return {};
}
