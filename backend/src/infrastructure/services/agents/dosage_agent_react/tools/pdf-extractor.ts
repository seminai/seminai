/**
 * PDF file extraction logic for extract_from_file tool.
 * Offloads heavy processing (OCR + LLM) to ChatExtractionQueue
 * so the agent stream can return immediately without timing out.
 */
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { getChatExtractionQueue } from '../../../../queue/ChatExtractionQueue';

export async function handlePdfFile(
  threadId: string,
  fileBuffer: Buffer,
  fileName: string,
  userId: string,
): Promise<string> {
  const queue = getChatExtractionQueue();
  const mentions = (getWorkingMemory(threadId).currentMentions ?? []).map((m) => ({
    type: m.type,
    id: m.id,
    label: m.label,
  }));
  const jobId = await queue.addJob({
    threadId,
    userId,
    fileBuffer,
    fileName,
    mimeType: 'application/pdf',
    mentions,
  });

  updateWorkingMemory(threadId, {
    pendingExtractionJobId: jobId,
    pendingExtractionFileName: fileName,
    pendingExtractionFailure: undefined,
  });

  return JSON.stringify({
    status: 'processing',
    jobId,
    message:
      `Il file "${fileName}" è stato accodato per l'elaborazione. ` +
      `L'utente riceverà un aggiornamento automatico quando l'estrazione sarà completata.`,
    hint:
      "Informa l'utente che il file è in elaborazione e che riceverà una notifica " +
      'quando sarà pronto. Non bloccare la conversazione.',
  });
}
