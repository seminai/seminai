import { buildChatTabTitle, toDisplayTime } from '@/lib/chat-tab-format';
import type { ChatAttachmentKind, ChatAttachmentViewModel } from '@/types/chat-attachment';

export interface ApiSuccessResponse<T> {
  readonly status: 'success';
  readonly data: T;
}

export interface DosageChatListItem {
  readonly id: string;
  readonly threadId: string;
  readonly category: string;
  readonly modelName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastMessage: {
    readonly content: string;
    readonly role: string;
    readonly createdAt: string;
  } | null;
}

export interface PersistedPendingToolCall {
  readonly id?: string;
  readonly name: string;
  readonly args?: unknown;
}

export interface PersistedMessageMetadata {
  readonly attachments?: unknown;
  readonly extractionReviewId?: string;
  readonly extractionArchived?: boolean;
  readonly extractionId?: string;
  readonly archiveUrl?: string;
  readonly extractionFailed?: boolean;
  readonly extractionError?: string;
  readonly extractionJobId?: string;
  readonly fileName?: string;
  readonly [key: string]: unknown;
}

export interface DosageChatMessage {
  readonly id: string;
  readonly role: string;
  readonly content: string;
  readonly createdAt: string;
  readonly status: string | null;
  readonly pendingToolCalls?: readonly PersistedPendingToolCall[] | null;
  readonly metadata?: PersistedMessageMetadata | null;
}

export interface DosageChatDetail {
  readonly id: string;
  readonly threadId: string;
  readonly category: string;
  readonly modelName: string | null;
  readonly temperature: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly DosageChatMessage[];
}

export interface ChatHistoryItemViewModel {
  readonly id: string;
  readonly title: string;
}

export interface ChatMessageViewModel {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
  readonly createdAtIso: string;
  readonly status: string | null;
  readonly pendingToolCalls: readonly PersistedPendingToolCall[];
  readonly attachments: readonly ChatAttachmentViewModel[];
  readonly extractionReviewId?: string;
  readonly archivedExtractionId?: string;
  readonly archivedExtractionUrl?: string;
  readonly extractionFailed?: boolean;
  readonly extractionError?: string;
  readonly extractionJobId?: string;
  readonly extractionFileName?: string;
}

function normalizeRole(role: string): 'user' | 'assistant' {
  const normalized = role.trim().toUpperCase();
  return normalized === 'ASSISTANT' ? 'assistant' : 'user';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inferAttachmentKind(name: string, mimeType: string): ChatAttachmentKind {
  const normalizedMime = mimeType.toLowerCase();
  if (normalizedMime.startsWith('image/')) return 'image';
  if (/(\.csv|\.doc|\.docx|\.pdf|\.txt|\.xls|\.xlsx|\.xml)$/i.test(name)) return 'document';
  if (normalizedMime === 'application/pdf' || normalizedMime.startsWith('text/')) {
    return 'document';
  }
  return 'other';
}

function normalizeAttachmentKind(value: unknown, name: string, mimeType: string): ChatAttachmentKind {
  if (value === 'image' || value === 'document' || value === 'other') return value;
  return inferAttachmentKind(name, mimeType);
}

function mapPersistedAttachment(
  rawAttachment: unknown,
  index: number,
): ChatAttachmentViewModel | null {
  if (!isRecord(rawAttachment)) return null;
  const name = typeof rawAttachment.name === 'string' ? rawAttachment.name : null;
  const mimeType =
    typeof rawAttachment.mimeType === 'string' ? rawAttachment.mimeType : 'application/octet-stream';
  const url = typeof rawAttachment.url === 'string' ? rawAttachment.url : null;
  const size = typeof rawAttachment.size === 'number' ? rawAttachment.size : null;
  if (!name || !url || size === null || !Number.isFinite(size)) return null;
  return {
    id: typeof rawAttachment.id === 'string' ? rawAttachment.id : `${name}-${index}`,
    name,
    mimeType,
    size,
    url,
    kind: normalizeAttachmentKind(rawAttachment.kind, name, mimeType),
    status: 'sent',
  };
}

function mapPersistedAttachments(
  metadata: PersistedMessageMetadata | null | undefined,
): readonly ChatAttachmentViewModel[] {
  if (!Array.isArray(metadata?.attachments)) return [];
  return metadata.attachments
    .map((attachment, index) => mapPersistedAttachment(attachment, index))
    .filter((attachment): attachment is ChatAttachmentViewModel => attachment !== null);
}

export function mapChatsToHistoryItems(
  chats: readonly DosageChatListItem[],
): readonly ChatHistoryItemViewModel[] {
  return chats.map((chat) => {
    const firstUserMessage =
      chat.lastMessage?.role.trim().toUpperCase() === 'USER' ? chat.lastMessage.content : null;
    return {
      id: chat.id,
      title: buildChatTabTitle({ message: firstUserMessage, updatedAt: chat.updatedAt }),
    };
  });
}

export function mapChatMessages(
  messages: readonly DosageChatMessage[],
): readonly ChatMessageViewModel[] {
  return messages.map((message) => ({
    id: message.id,
    role: normalizeRole(message.role),
    content: message.content,
    timestamp: toDisplayTime(message.createdAt),
    createdAtIso: message.createdAt,
    status: message.status,
    pendingToolCalls: message.pendingToolCalls ?? [],
    attachments: mapPersistedAttachments(message.metadata),
    extractionReviewId:
      typeof message.metadata?.extractionReviewId === 'string'
        ? message.metadata.extractionReviewId
        : undefined,
    archivedExtractionId:
      typeof message.metadata?.extractionId === 'string'
        ? message.metadata.extractionId
        : undefined,
    archivedExtractionUrl:
      typeof message.metadata?.archiveUrl === 'string'
        ? message.metadata.archiveUrl
        : undefined,
    extractionFailed: message.metadata?.extractionFailed === true,
    extractionError:
      typeof message.metadata?.extractionError === 'string'
        ? message.metadata.extractionError
        : undefined,
    extractionJobId:
      typeof message.metadata?.extractionJobId === 'string'
        ? message.metadata.extractionJobId
        : undefined,
    extractionFileName:
      typeof message.metadata?.fileName === 'string' ? message.metadata.fileName : undefined,
  }));
}
