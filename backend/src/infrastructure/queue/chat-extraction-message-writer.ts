/**
 * Persists a chat assistant message right after the async ChatExtractionQueue
 * finishes a job. The message becomes visible in the chat history without
 * the user having to ask "fatto?", because the FE invalidates the chat query
 * on `agent:extraction_complete`.
 *
 * Also exposes a variant invoked from the commit endpoint to write a final
 * "archived" message with a clickable internal link to the archive detail page.
 */
import { type DocumentCategory, Prisma } from '@prisma/client';
import { prisma } from '../repositories/Prisma';
import { getDocumentCategoryMeta } from '../../domain/dtos/document-category.dto';
import { withChatSequenceLock } from './chat-sequence-lock';

async function getChatIdByThreadId(threadId: string): Promise<string | null> {
  const chat = await prisma.chat.findUnique({
    where: { threadId },
    select: { id: true },
  });
  return chat?.id ?? null;
}

interface WriteExtractionMessageInput {
  readonly threadId: string;
  readonly fileName: string;
  readonly documentCategory: DocumentCategory;
  readonly summary: string;
  /** When true, the review form was already pushed via socket — wording switches to past tense. */
  readonly formAlreadyPresented?: boolean;
  /**
   * When the review form was auto-presented, the reviewId persisted in Redis.
   * Saved into message metadata so the FE can rehydrate the editable form after
   * a chat reload (HistoricalExtractionReviewBubble keys off this).
   */
  readonly extractionReviewId?: string;
}

export async function writeExtractionCompletedMessage(
  input: WriteExtractionMessageInput,
): Promise<void> {
  try {
    const chatId = await getChatIdByThreadId(input.threadId);
    if (!chatId) return;

    const categoryMeta = getDocumentCategoryMeta(input.documentCategory);

    const closingLine = input.formAlreadyPresented
      ? 'Ho preparato il **form di revisione** con i dati estratti — controlla i campi e clicca **Salva** per archiviare il documento.'
      : 'I dati estratti sono pronti per la revisione. Se vuoi proseguire scrivi "procedi" e ti mostro il form.';

    const content = [
      `**Estrazione completata** · _${categoryMeta.labelIt}_`,
      '',
      `File: \`${input.fileName}\``,
      '',
      input.summary,
      '',
      closingLine,
    ].join('\n');

    const metadata: Record<string, unknown> = {
      extractionCompleted: true,
      documentCategory: input.documentCategory,
      fileName: input.fileName,
    };
    if (input.extractionReviewId) {
      metadata.extractionReviewId = input.extractionReviewId;
    }

    await withChatSequenceLock(chatId, async ({ tx, nextSequence }) => {
      await tx.message.create({
        data: {
          chatId,
          role: 'ASSISTANT',
          content,
          sequence: nextSequence,
          status: 'COMPLETED',
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    });
  } catch (err) {
    console.warn('[chat-extraction-message-writer] Failed to persist message:', err);
  }
}

interface WriteExtractionFailedInput {
  readonly threadId: string;
  readonly fileName: string;
  readonly extractionError: string;
  readonly extractionJobId: string;
  readonly documentCategory?: DocumentCategory;
}

export async function writeExtractionFailedMessage(
  input: WriteExtractionFailedInput,
): Promise<void> {
  try {
    const chatId = await getChatIdByThreadId(input.threadId);
    if (!chatId) return;

    const categoryLabel = input.documentCategory
      ? getDocumentCategoryMeta(input.documentCategory).labelIt
      : 'Documento';

    const content = [
      `**Estrazione fallita** · _${categoryLabel}_`,
      '',
      `File: \`${input.fileName}\``,
      '',
      input.extractionError,
      '',
      '*Riprova caricando una stampa definitiva o un PDF testuale di buona qualità.*',
    ].join('\n');

    const metadata: Record<string, unknown> = {
      extractionFailed: true,
      fileName: input.fileName,
      extractionError: input.extractionError,
      extractionJobId: input.extractionJobId,
    };
    if (input.documentCategory) {
      metadata.documentCategory = input.documentCategory;
    }

    await withChatSequenceLock(chatId, async ({ tx, nextSequence }) => {
      await tx.message.create({
        data: {
          chatId,
          role: 'ASSISTANT',
          content,
          sequence: nextSequence,
          status: 'COMPLETED',
          metadata: metadata as Prisma.InputJsonValue,
        },
      });
    });
  } catch (err) {
    console.warn('[chat-extraction-message-writer] Failed to persist failed message:', err);
  }
}

interface WriteExtractionArchivedInput {
  readonly threadId: string;
  readonly fileName: string;
  readonly documentCategory: DocumentCategory;
  readonly extractionId: string;
  readonly archiveUrl: string;
}

/**
 * Persists the closing assistant message after a chat extraction has been
 * committed to the archive. Includes a clickable link to the dedicated
 * detail page (rendered by the router in-app, no full reload).
 */
export async function writeExtractionArchivedMessage(
  input: WriteExtractionArchivedInput,
): Promise<void> {
  try {
    const chatId = await getChatIdByThreadId(input.threadId);
    if (!chatId) return;

    const categoryMeta = getDocumentCategoryMeta(input.documentCategory);

    const content = [
      `**Documento archiviato** · _${categoryMeta.labelIt}_`,
      '',
      `Il file \`${input.fileName}\` è stato salvato in archivio con stato **Da Confermare**.`,
      '',
      `Apri i dettagli: [Vai alla scheda nell'archivio](${input.archiveUrl})`,
    ].join('\n');

    await withChatSequenceLock(chatId, async ({ tx, nextSequence }) => {
      await tx.message.create({
        data: {
          chatId,
          role: 'ASSISTANT',
          content,
          sequence: nextSequence,
          status: 'COMPLETED',
          metadata: {
            extractionArchived: true,
            documentCategory: input.documentCategory,
            fileName: input.fileName,
            extractionId: input.extractionId,
            archiveUrl: input.archiveUrl,
          },
        },
      });
    });
  } catch (err) {
    console.warn('[chat-extraction-message-writer] Failed to persist archived message:', err);
  }
}
