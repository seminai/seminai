/**
 * Tool: check_extraction_status
 * Lets the agent retrieve the result of an async PDF extraction
 * that was offloaded to ChatExtractionQueue.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory } from '../working-memory';
import { getChatExtractionQueue } from '../../../../queue/ChatExtractionQueue';
import type { DocumentCategory } from '@prisma/client';
import type { StockPreviewEntry } from './file-extraction-types';

interface SeedLine {
  readonly productName?: string;
  readonly registrationNumber?: string;
  readonly quantity?: number;
  readonly unitOfMeasure?: string;
  readonly unitPrice?: number;
}

interface StockReviewSeed {
  readonly invoiceNumber?: string;
  readonly invoiceDate?: string;
  readonly ddtNumber?: string;
  readonly ddtDate?: string;
  readonly supplierName?: string;
  readonly totalLines?: number;
  readonly lines?: readonly SeedLine[];
}

function buildStockReviewSeed(
  entries: readonly StockPreviewEntry[],
  detectedType: 'invoice' | 'ddt',
): { category: DocumentCategory; seed: StockReviewSeed } {
  const first = entries[0];
  const supplierName = first?.stock.companySupplierName ?? '';
  const totalLines = entries.length;
  const lines: SeedLine[] = entries.map((entry) => ({
    productName: entry.name,
    registrationNumber: entry.registrationNumber ?? undefined,
    quantity: entry.stock.quantity,
    unitOfMeasure: entry.stock.unitOfMeasureQuantity,
    unitPrice: entry.stock.price,
  }));
  if (detectedType === 'ddt') {
    return {
      category: 'DDT',
      seed: {
        ddtNumber: first?.stock.ddtCode ?? '',
        ddtDate: first?.stock.ddtDate ?? '',
        supplierName,
        totalLines,
        lines,
      },
    };
  }
  return {
    category: 'FATTURA',
    seed: {
      invoiceNumber: first?.stock.invoiceCode ?? first?.stock.ddtCode ?? '',
      invoiceDate: first?.stock.ddtDate ?? '',
      supplierName,
      totalLines,
      lines,
    },
  };
}

export function createCheckExtractionStatusTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'check_extraction_status',
    description:
      "Controlla lo stato dell'estrazione file in corso (asincrona). " +
      'Se completata, restituisce i dati estratti pronti per essere presentati. ' +
      "Usalo quando c'è un pendingExtractionJobId nella working memory o " +
      "quando l'utente chiede aggiornamenti su un file caricato.",
    schema: z.object({
      jobId: z
        .string()
        .optional()
        .describe('ID del job di estrazione. Se omesso, usa il jobId dalla working memory.'),
    }),
    func: async ({ jobId }) => {
      const wm = getWorkingMemory(threadId);

      // Worker already reported a failure for this thread — surface it
      // deterministically so the agent never hallucinates "still processing".
      if (wm.pendingExtractionFailure) {
        const fail = wm.pendingExtractionFailure;
        return JSON.stringify({
          status: 'failed',
          error: fail.errorMessage,
          hint:
            "Comunica all'utente che l'estrazione è fallita citando il motivo. " +
            'NON chiamare extract_from_file di nuovo senza un nuovo upload.',
        });
      }

      // Extraction already completed — data in working memory
      if (!wm.pendingExtractionJobId) {
        if (wm.extractedFileData) {
          return JSON.stringify({
            status: 'completed',
            detectedFileType: wm.detectedFileType ?? 'agricultural',
            data: wm.extractedFileData,
            workingMemoryKey: 'extractedFileData',
            importTool: 'import_from_file',
            message:
              "Dati estratti disponibili. Presenta l'anteprima in tabella e chiedi conferma.",
          });
        }
        if (wm.extractedStockData) {
          const detectedType =
            wm.detectedFileType === 'ddt' ? 'ddt' : ('invoice' as 'invoice' | 'ddt');
          const { category, seed } = buildStockReviewSeed(
            wm.extractedStockData as readonly StockPreviewEntry[],
            detectedType,
          );
          return JSON.stringify({
            status: 'completed',
            detectedFileType: detectedType,
            documentCategory: category,
            data: wm.extractedStockData,
            workingMemoryKey: 'extractedStockData',
            nextTool: 'present_extraction_review',
            reviewSeed: seed,
            message:
              `Estrazione completata: ${(wm.extractedStockData as readonly StockPreviewEntry[]).length} righe di tipo ${category}. ` +
              `PROSSIMO PASSO OBBLIGATORIO: dopo aver risolto la companyId (usa @mention o list_user_companies), chiama present_extraction_review ` +
              `con category="${category}", fileName, companyId, e extractedData uguale al campo reviewSeed di questo JSON. ` +
              `NON chiamare import_stock_from_file: il salvataggio passa dal form di revisione + archivio.`,
          });
        }
        return JSON.stringify({
          status: 'no_extraction',
          message: 'Nessuna estrazione in corso o completata.',
        });
      }

      // Extraction still tracked — poll the queue
      const activeJobId = jobId ?? wm.pendingExtractionJobId;
      if (!activeJobId) {
        return JSON.stringify({
          status: 'no_extraction',
          message: 'Nessuna estrazione in corso.',
        });
      }

      try {
        const queue = getChatExtractionQueue();
        const status = await queue.getJobStatus(activeJobId);

        if (status.state === 'completed' && status.result) {
          // Worker should have already written to WM, but return data anyway
          return status.result.toolResponse;
        }

        if (status.state === 'failed') {
          return JSON.stringify({
            status: 'failed',
            error: status.failedReason ?? 'Estrazione fallita.',
            hint: "Informa l'utente che l'estrazione è fallita e suggerisci di riprovare.",
          });
        }

        return JSON.stringify({
          status: 'in_progress',
          progress: status.progress,
          message: status.message ?? 'Elaborazione in corso...',
          hint: "Informa l'utente che l'elaborazione è ancora in corso e che riceverà una notifica.",
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ status: 'error', error: msg });
      }
    },
  });
}
