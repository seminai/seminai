import { Job } from 'bullmq';
import { DocumentCategory } from '@prisma/client';
import { writeTempFile, cleanupTempFile } from '../services/agents/dosage_agent_react/tools/temp-file-utils';
import { DocumentExtractionOrchestrator } from '../services/extraction/document-extraction-orchestrator';
import type { FieldExtracted, ProductionUnitExtracted, StockPreviewEntry } from '../services/agents/dosage_agent_react/tools/file-extraction-types';
import { updateWorkingMemory, getWorkingMemory } from '../services/agents/dosage_agent_react/working-memory';
import { createChatEmitter } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';
import { autoPresentExtractionReview } from './auto-present-extraction-review';
import { writeExtractionCompletedMessage } from './chat-extraction-message-writer';
import { getDocumentCategoryMeta } from '../../domain/dtos/document-category.dto';
import { ChatExtractionJobResult } from './ChatExtractionQueue.part-01-chat-extraction-job-data';
import { buildReviewSeed } from './ChatExtractionQueue.part-04-build-review-seed';

export async function processCommercialDocumentPdf(
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

export function buildPianoColturaleResponse(
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

export function buildInvoiceResponse(
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
