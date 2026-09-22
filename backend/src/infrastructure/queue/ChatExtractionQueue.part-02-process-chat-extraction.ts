import { Job } from 'bullmq';
import { decompressIfNeeded, CompressedData } from '../utils/redis-compression.util';
import { createChatEmitter } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import { updateWorkingMemory, getWorkingMemory } from '../services/agents/dosage_agent_react/working-memory';
import { pdfToText } from '../services/ocr/pdfToText';
import { resolveFileCategory } from '../services/extraction/file-category-resolver';
import { mapPdfExtractionRoute } from '../services/extraction/pdf-extraction-router';
import { writeExtractionCompletedMessage, writeExtractionFailedMessage } from './chat-extraction-message-writer';
import { DocumentCategory } from '@prisma/client';
import { PianoColturalePdfAgent } from '../services/agents/file_agent/piano_colturale_pdf_agent';
import type { FieldExtracted, ProductionUnitExtracted } from '../services/agents/dosage_agent_react/tools/file-extraction-types';
import { ChatExtractionJobData, ChatExtractionJobResult, LOG_TAG } from './ChatExtractionQueue.part-01-chat-extraction-job-data';
import { buildPianoColturaleResponse, processCommercialDocumentPdf } from './ChatExtractionQueue.part-03-process-commercial-document-pdf';

// ── Worker logic (extracted to stay under 300 lines) ──

export async function processChatExtraction(
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

export async function processPianoColturalePdf(
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
