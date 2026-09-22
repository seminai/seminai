/**
 * Tool: present_extraction_review
 * Presents an editable form to the user with the data extracted from a document.
 * The form is rendered by the FE on the `extraction_review_presented` SSE event,
 * with category-specific fields driven by FieldDescriptor metadata from the BE.
 *
 * Non-destructive: stores the pending review in Redis (TTL 30 min) and emits an
 * event. The agent should STOP and wait for the user to Save (PATCH) or Cancel.
 * Saving is wired in Fase 4 (commit into FileExtraction).
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { DocumentCategory } from '@prisma/client';
import { getExtractionSchema, getExtractionFields } from '../../../../../domain/extraction-schemas';
import { DOCUMENT_CATEGORY_VALUES } from '../../../../../domain/dtos/document-category.dto';
import {
  getPendingExtraction,
  savePendingExtraction,
} from '../../../../persistence/pending-extraction-store';
import { getWorkingMemory, hasWorkingMemoryData, updateWorkingMemory } from '../working-memory';
import { FileService } from '../../../FileService';
import { createChatEmitter } from '../socket/chat-socket-emitter';

interface CreateToolParams {
  readonly threadId: string;
  readonly userId: string;
}

export function createPresentExtractionReviewTool(params: CreateToolParams): DynamicStructuredTool {
  const { threadId, userId } = params;
  return new DynamicStructuredTool({
    name: 'present_extraction_review',
    description: `Mostra all'utente un form editabile con i dati estratti da un documento, prima di salvarli nell'archivio.
Usa questo tool DOPO extract_from_file e DOPO aver risolto la companyId. NON crea record nel database.
I campi del form sono determinati automaticamente dalla categoria (DDT/Fattura/Disciplinare/...).
L'utente puo' modificare i campi e clicca Salva o Annulla.
Dopo aver chiamato questo tool, la tua risposta deve SOLO invitare l'utente a confermare/modificare i dati.
NON procedere finche' l'utente non ha risposto.`,
    schema: z.object({
      category: z
        .enum(DOCUMENT_CATEGORY_VALUES as [string, ...string[]])
        .describe('Categoria documento (uno dei valori DocumentCategory)'),
      companyId: z.string().min(1).describe("ID dell'azienda risolta (mention o questionario)"),
      fileName: z.string().min(1).describe('Nome del file originale'),
      fileUrl: z.string().url().optional().describe('URL pubblico del file (se disponibile)'),
      fileId: z.string().optional().describe("ID del record File nel DB (se gia' presente)"),
      extractedData: z
        .record(z.string(), z.unknown())
        .describe(
          "Mappa key->value dei campi gia' estratti. Verra' validata contro lo schema della categoria.",
        ),
    }),
    func: async ({ category, companyId, fileName, fileUrl, fileId, extractedData }) => {
      const categoryEnum = category as DocumentCategory;
      const schema = getExtractionSchema(categoryEnum);
      const parsed = schema.zodSchema.safeParse(extractedData);
      const dataForReview = parsed.success
        ? (parsed.data as Record<string, unknown>)
        : extractedData;

      // Idempotency: if a pending review already exists for this thread, reuse it
      // instead of creating a new one. Prevents the agent from spawning multiple
      // reviewIds when it re-invokes the tool in a loop.
      const existingWm = getWorkingMemory(threadId).pendingExtractionReview;
      const existingRecord = existingWm?.reviewId
        ? await getPendingExtraction(existingWm.reviewId)
        : null;
      const isSameDocument =
        existingRecord?.category === categoryEnum && existingRecord?.fileName === fileName;

      const reviewId = isSameDocument ? existingRecord!.reviewId : randomUUID();
      const resolvedFileUrl = isSameDocument
        ? existingRecord!.fileUrl ?? fileUrl
        : fileUrl ?? (await uploadFileFromWorkingMemory(threadId, userId));

      const now = Date.now();
      await savePendingExtraction({
        reviewId,
        threadId,
        userId,
        companyId,
        category: categoryEnum,
        fileName,
        fileUrl: resolvedFileUrl,
        fileId,
        data: dataForReview,
        createdAt: isSameDocument ? existingRecord!.createdAt : now,
        updatedAt: now,
      });

      updateWorkingMemory(threadId, {
        pendingExtractionReview: {
          reviewId,
          category: categoryEnum,
          fileName,
        },
      });

      const normalization = getWorkingMemory(threadId).normalizedExtraction;

      // Emit the socket event immediately so the FE can render the form
      // even if the agent loops or the stream takes long to finalize.
      const emitter = createChatEmitter(threadId);
      emitter?.emitExtractionReviewPresented({
        reviewId,
        category: categoryEnum,
        companyId,
        fileName,
        fileUrl: resolvedFileUrl,
        fields: getExtractionFields(categoryEnum),
        data: dataForReview,
        normalization,
      });

      const fields = getExtractionFields(categoryEnum);
      const fieldSummary = fields
        .map((f) => `${f.labelIt}${f.required ? ' (obbligatorio)' : ''}`)
        .join(', ');

      return JSON.stringify({
        success: true,
        agentMustStop: true,
        reviewId,
        category: categoryEnum,
        fileName,
        fileUrl: resolvedFileUrl,
        fieldsPresented: fields.length,
        validationOk: parsed.success,
        validationErrors: parsed.success ? undefined : parsed.error.issues.slice(0, 5),
        workingMemoryKey: 'pendingExtractionReview',
        idempotent: isSameDocument,
        normalizationStats: normalization?.stats,
        instruction:
          `FERMATI ORA. Il form di revisione è già mostrato all'utente nella chat (rendering UI interattivo). ` +
          `La tua PROSSIMA E ULTIMA azione è SOLO un breve messaggio testuale del tipo: ` +
          `"Ho preparato il form di revisione per ${fileName}: controlla i campi (${fieldSummary}) e clicca Salva o Annulla." ` +
          `DIVIETI ASSOLUTI: non richiamare present_extraction_review (è gia' stato chiamato per questo file), ` +
          `non chiamare import_stock_from_file, non chiamare import_from_file, non chiamare altri tool. ` +
          `Considera il turno COMPLETATO dopo il messaggio.`,
      });
    },
  });
}

/**
 * Uploads the file currently in working memory (from chat upload) to GCS.
 * Returns the public URL, or undefined if no file is in WM or upload fails.
 * This is best-effort: a failed upload must not block the review form.
 */
async function uploadFileFromWorkingMemory(
  threadId: string,
  userId: string,
): Promise<string | undefined> {
  if (!hasWorkingMemoryData(threadId, 'uploadedFileBuffer')) return undefined;
  try {
    const wm = getWorkingMemory(threadId);
    const buffer = wm.uploadedFileBuffer as Buffer | undefined;
    if (!buffer) return undefined;
    const fileName = (wm.uploadedFileName as string | undefined) ?? 'document';
    const mimeType = (wm.uploadedFileMimeType as string | undefined) ?? 'application/pdf';
    const fileService = new FileService(userId);
    return await fileService.uploadFile(
      {
        fieldname: 'file',
        originalname: fileName,
        encoding: '7bit',
        mimetype: mimeType,
        size: buffer.length,
        buffer,
      },
      userId,
      'chat-extractions',
      mimeType,
    );
  } catch (err) {
    console.warn('[present-extraction-review] GCS upload failed:', err);
    return undefined;
  }
}
