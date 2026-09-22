import type { MentionItem } from '../../../../domain/dtos/mention.dto';
import { resolveMentionContext } from './mention-context-resolver';
import { getWorkingMemory } from './working-memory';

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

interface UploadedFileContext {
  readonly fileName: string;
  readonly mimeType: string;
}

export interface BuildUserMessageContextParams {
  readonly threadId: string;
  readonly userMessage: string;
  readonly userId?: string;
  readonly mentions?: readonly MentionItem[];
  readonly includeWorkingMemoryContext?: boolean;
  /**
   * Client-driven context (e.g. a snapshot of an embedded form). When present
   * with formMode === 'production_units' the snapshot is appended to the
   * enriched message so the agent can reason on the current draft state.
   */
  readonly clientContext?: Record<string, unknown>;
}

export interface BuildUserMessageContextResult {
  readonly enrichedMessage: string;
}

/**
 * Builds the final user message seen by the agent, appending:
 * - working-memory attachment/extraction signals
 * - resolved mention context and explicit unresolved mention diagnostics
 */
export async function buildUserMessageContext(
  params: BuildUserMessageContextParams,
): Promise<BuildUserMessageContextResult> {
  const {
    threadId,
    userMessage,
    userId,
    mentions,
    includeWorkingMemoryContext = true,
    clientContext,
  } = params;
  let enrichedMessage = userMessage;
  const wm = includeWorkingMemoryContext ? getWorkingMemory(threadId) : undefined;

  const formSnapshotBlock = buildFormSnapshotBlock(clientContext);
  if (formSnapshotBlock) {
    enrichedMessage = `${enrichedMessage}\n\n${formSnapshotBlock}`;
  }

  const uploadedFiles = buildUploadedFileContext(wm);
  if (uploadedFiles.length > 0) {
    enrichedMessage = `${enrichedMessage}\n\n${buildUploadInstructionBlock(uploadedFiles)}`;
  }

  if (wm?.pendingExtractionJobId) {
    enrichedMessage += `\n\n[SYSTEM: Estrazione file "${wm.pendingExtractionFileName ?? 'unknown'}" in corso. Usa check_extraction_status per verificare se e' completata; il riferimento tecnico resta in working memory e non va mostrato all'utente.]`;
  } else if (wm?.extractedFileData && !wm.uploadedFileBuffer) {
    enrichedMessage +=
      "\n\n[SYSTEM: Dati estratti disponibili in working memory (extractedFileData). Presenta l'anteprima all'utente e chiedi conferma prima di procedere.]";
  }

  if (!mentions || mentions.length === 0 || !userId) {
    return { enrichedMessage };
  }

  try {
    const hasUploadedFilesInWorkingMemory = Boolean(
      wm?.uploadedFileBuffer || (wm?.uploadedFiles && wm.uploadedFiles.length > 0),
    );
    const hasFileMentions = mentions.some((mention) => mention.type === 'file');
    const mentionResolution = await resolveMentionContext({
      mentions,
      userId,
      hasUploadedFilesInWorkingMemory,
    });
    if (mentionResolution.context) {
      enrichedMessage += `\n\n${mentionResolution.context}`;
    }
    if (mentionResolution.unresolved.length > 0) {
      const unresolvedSummary = mentionResolution.unresolved
        .map((entry) => `- ${entry.type}:${entry.id} -> ${entry.reason}`)
        .join('\n');
      enrichedMessage += `\n\n[SYSTEM: Mention non risolte]\n${unresolvedSummary}`;
      mentionResolution.unresolved.forEach((entry) => {
        console.info(
          `[mention-context] unresolved type=${entry.type} id=${entry.id} reason=${entry.reason}`,
        );
      });
    }
    if (hasFileMentions && !hasUploadedFilesInWorkingMemory) {
      enrichedMessage +=
        "\n\n[SYSTEM: I documenti menzionati con @file provengono dall'archivio DB e non da upload corrente. NON dire 'allega il file' e NON invocare extract_from_file se non ci sono allegati in working memory. Usa il contesto documento gia' risolto; se non basta, chiedi quali campi specifici servono.]";
    }
  } catch (error) {
    console.warn('[user-message-context-builder] Failed to resolve mention context:', error);
  }

  return { enrichedMessage };
}

/**
 * Builds a `<currentForm>` block from clientContext when the FE signals an
 * embedded form-editor session. The snapshot lets the agent reason about the
 * current draft state before proposing patches via the `propose_*` tools.
 * Returns undefined when no form context is provided.
 */
function buildFormSnapshotBlock(clientContext?: Record<string, unknown>): string | undefined {
  if (!clientContext) return undefined;
  const formMode = clientContext.formMode;
  if (formMode !== 'production_units') return undefined;
  const snapshot = clientContext.formSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  let serialized: string;
  try {
    serialized = JSON.stringify(snapshot);
  } catch {
    return undefined;
  }
  const truncated =
    serialized.length > 8000 ? `${serialized.slice(0, 8000)}…(truncated)` : serialized;
  return [
    '[SYSTEM: Form-editor mode "production_units". Stato corrente del form a sinistra:',
    `<currentForm>${truncated}</currentForm>`,
    'Usa i tool propose_* per proporre modifiche. Per consigli senza modificare il form rispondi solo con testo.]',
  ].join('\n');
}

function buildUploadedFileContext(
  wm: ReturnType<typeof getWorkingMemory> | undefined,
): UploadedFileContext[] {
  if (!wm) return [];
  if (wm.uploadedFiles) {
    return wm.uploadedFiles.map((file) => ({
      fileName: file.fileName,
      mimeType: file.mimeType,
    }));
  }
  if (!wm.uploadedFileBuffer || !wm.uploadedFileName) return [];
  return [
    {
      fileName: wm.uploadedFileName,
      mimeType: wm.uploadedFileMimeType ?? 'unknown',
    },
  ];
}

function buildUploadInstructionBlock(files: readonly UploadedFileContext[]): string {
  const fileList = files.map((file) => `- ${file.fileName} (${file.mimeType})`).join('\n');
  if (files.some((file) => SUPPORTED_IMAGE_MIME_TYPES.has(file.mimeType.toLowerCase()))) {
    return [
      `[SYSTEM: ${files.length} file allegato/i in working memory]`,
      fileList,
      '[SYSTEM: E presente almeno una immagine supportata della richiesta utente. Se la richiesta riguarda una pianta malata o una foto da analizzare, usa diagnose_from_photo. NON usare extract_from_file per analizzare immagini di piante. Dopo diagnose_from_photo rispondi brevemente con sintomi visibili, possibili cause, gravita, azioni consigliate e domande di follow-up; poi fermati. Usa extract_from_file solo se la richiesta riguarda anche documenti non immagine.]',
    ].join('\n');
  }
  return [
    `[SYSTEM: ${files.length} file allegato/i in working memory, usa extract_from_file per elaborarli]`,
    fileList,
  ].join('\n');
}
