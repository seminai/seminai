import type { AgentStreamEvent } from '@/lib/agent-chat-events';
import { resolveToolLabel } from '@/constants/agent-tool-labels';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import type {
  TransientAssistantMessage,
  TransientToolCall,
  PendingToolCall,
} from '@/types/chat-stream';
import type {
  ChatAttachmentKind,
  ChatAttachmentStatus,
  ChatAttachmentViewModel,
} from '@/types/chat-attachment';

function generateId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'text/xml',
  'application/xml',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const DOCUMENT_EXTENSIONS = /\.(csv|doc|docx|pdf|txt|xls|xlsx|xml)$/i;

function getAttachmentKind(file: File): ChatAttachmentKind {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (DOCUMENT_MIME_TYPES.has(mimeType) || DOCUMENT_EXTENSIONS.test(file.name)) {
    return 'document';
  }
  return 'other';
}

function createAttachment(
  file: File,
  status: ChatAttachmentStatus,
): ChatAttachmentViewModel {
  return {
    id: generateId(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    kind: getAttachmentKind(file),
    file,
    status,
  };
}

function buildToolCall(name: string, id: string | undefined): TransientToolCall {
  return {
    id: id ?? generateId(),
    name,
    labelIt: resolveToolLabel(name).labelIt,
    status: 'running',
    startedAtIso: nowIso(),
  };
}

function buildPendingToolCall(
  name: string,
  id: string | undefined,
  riskLevel: 'low' | 'medium' | 'high' | undefined,
): PendingToolCall {
  return {
    id: id ?? generateId(),
    name,
    labelIt: resolveToolLabel(name).labelIt,
    riskLevel: riskLevel ?? 'medium',
  };
}

function applyToolCall(
  current: TransientAssistantMessage,
  event: AgentStreamEvent,
): TransientAssistantMessage {
  if (!event.toolCall) return current;
  const next = buildToolCall(event.toolCall.name, event.toolCall.id);
  const completedExisting = current.toolCalls.map((t) =>
    t.status === 'running' ? { ...t, status: 'completed' as const } : t,
  );
  return {
    ...current,
    status: current.status === 'thinking' ? 'streaming' : current.status,
    toolCalls: [...completedExisting, next],
  };
}

function applyToolResult(
  current: TransientAssistantMessage,
  event: AgentStreamEvent,
): TransientAssistantMessage {
  const targetId = event.toolCall?.id;
  const updated = current.toolCalls.map((t) => {
    if (targetId && t.id === targetId) return { ...t, status: 'completed' as const };
    if (!targetId && t.status === 'running') return { ...t, status: 'completed' as const };
    return t;
  });
  return { ...current, toolCalls: updated };
}

function applyRequiresApproval(
  current: TransientAssistantMessage,
  event: AgentStreamEvent,
): TransientAssistantMessage {
  const pending = event.toolCall
    ? [buildPendingToolCall(event.toolCall.name, event.toolCall.id, event.riskLevel)]
    : current.pendingToolCalls;
  return { ...current, status: 'requires_approval', pendingToolCalls: pending };
}

export function applyStreamEvent(
  current: TransientAssistantMessage,
  event: AgentStreamEvent,
): TransientAssistantMessage {
  switch (event.type) {
    case 'pipeline_progress':
      return event.pipelineProgress
        ? { ...current, pipelineProgress: { ...event.pipelineProgress } }
        : current;
    case 'tool_call':
      return applyToolCall(current, event);
    case 'tool_result':
      return applyToolResult(current, event);
    case 'token':
      if (!event.content) return current;
      return { ...current, status: 'streaming', content: current.content + event.content };
    case 'requires_approval':
      return applyRequiresApproval(current, event);
    case 'error':
      return {
        ...current,
        status: 'error',
        errorMessage: sanitizeUserFacingText(
          event.error ?? 'Errore durante la generazione della risposta.',
        ),
      };
    case 'complete':
      return {
        ...current,
        status: 'completed',
        content: event.response?.message ?? current.content,
        pendingToolCalls: [],
        toolCalls: current.toolCalls.map((tool) =>
          tool.status === 'running' ? { ...tool, status: 'completed' as const } : tool,
        ),
      };
    case 'cancelled':
      return { ...current, status: 'cancelled', pendingToolCalls: [] };
    case 'extraction_review_presented':
      if (!event.extractionReview) return current;
      return {
        ...current,
        status: 'requires_approval',
        extractionReview: { payload: event.extractionReview, status: 'editing' },
      };
    case 'extraction_review_saved':
      if (!current.extractionReview) return current;
      return {
        ...current,
        extractionReview: { ...current.extractionReview, status: 'saved' },
      };
    case 'extraction_review_cancelled':
      if (!current.extractionReview) return current;
      return {
        ...current,
        extractionReview: { ...current.extractionReview, status: 'cancelled' },
      };
    case 'extraction_archived':
      if (!current.extractionReview) return current;
      return {
        ...current,
        extractionReview: { ...current.extractionReview, status: 'saved' },
      };
    default:
      return current;
  }
}

export function createInitialAssistant(): TransientAssistantMessage {
  return {
    id: generateId(),
    createdAtIso: nowIso(),
    status: 'thinking',
    content: '',
    toolCalls: [],
    pipelineProgress: null,
    errorMessage: null,
    pendingToolCalls: [],
    extractionReview: null,
  };
}

interface PersistedApprovalInput {
  readonly id: string;
  readonly content: string;
  readonly createdAtIso: string;
  readonly pendingToolCalls: ReadonlyArray<{ readonly name: string; readonly id?: string }>;
}

export function createApprovalAssistantFromPersisted(
  input: PersistedApprovalInput,
): TransientAssistantMessage {
  return {
    id: input.id,
    createdAtIso: input.createdAtIso,
    status: 'requires_approval',
    content: input.content,
    toolCalls: [],
    pipelineProgress: null,
    errorMessage: null,
    pendingToolCalls: input.pendingToolCalls.map((tc) =>
      buildPendingToolCall(tc.name, tc.id, undefined),
    ),
    extractionReview: null,
  };
}

export function createInitialUser(content: string, files: readonly File[] = []): {
  readonly id: string;
  readonly content: string;
  readonly createdAtIso: string;
  readonly status: 'pending';
  readonly attachments: readonly ChatAttachmentViewModel[];
} {
  return {
    id: generateId(),
    content,
    createdAtIso: nowIso(),
    status: 'pending',
    attachments: files.map((file) => createAttachment(file, 'uploading')),
  };
}
