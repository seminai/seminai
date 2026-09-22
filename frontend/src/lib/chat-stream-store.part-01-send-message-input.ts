import type { MentionItem } from '@/types/mention';
import type {
  TransientAssistantMessage,
  TransientUserStatus,
  TransientUserMessage,
} from '@/types/chat-stream';
import type { QueryClient } from '@tanstack/react-query';
import type { AgentStreamEvent } from '@/lib/agent-chat-events';
import {
  applyStreamEvent,
  createInitialAssistant,
} from '@/hooks/use-dosage-chat-stream-reducer';

export interface SendMessageInput {
  readonly message: string;
  readonly files?: readonly File[];
  readonly mentions?: readonly MentionItem[];
  readonly clientContext?: Record<string, unknown>;
  /** Active workspace ID; routes the chat to the agent matching the workspace kind. */
  readonly workspaceId?: string;
}

export interface StreamState {
  readonly threadId: string;
  readonly chatId: string | null;
  readonly transientUser: TransientUserMessage | null;
  readonly transientAssistant: TransientAssistantMessage | null;
  readonly isStreaming: boolean;
  readonly streamError: string | null;
  readonly lastPayload: SendMessageInput | null;
  readonly lastEventSeq: number;
}

export type Listener = () => void;

export type ChatCreatedListener = (threadId: string, newChatId: string) => void;

export type FormPatchListener = (
  threadId: string,
  patch: import('./agent-chat-events').FormPatchPayload,
) => void;

export const runtime = {
  states: new Map<string, StreamState>(),
  listenersByThread: new Map<string, Set<Listener>>(),
  controllers: new Map<string, AbortController>(),
  chatCreatedListeners: new Set<ChatCreatedListener>(),
  formPatchListenersByThread: new Map<string, Set<FormPatchListener>>(),
  queryClientRef: null as QueryClient | null,
  pendingNewChatThreadId: null as string | null,
  threadRoomRefCounts: new Map<string, number>(),
  threadRoomListeners: new Set<ThreadRoomListener>(),
};

export function configureChatStreamStore(qc: QueryClient): void {
  runtime.queryClientRef = qc;
}

export function getOrCreatePendingThreadId(): string {
  if (!runtime.pendingNewChatThreadId) {
    runtime.pendingNewChatThreadId = crypto.randomUUID();
  }
  return runtime.pendingNewChatThreadId;
}

export function consumePendingThreadId(threadId: string): void {
  if (runtime.pendingNewChatThreadId === threadId) {
    runtime.pendingNewChatThreadId = null;
  }
}

export function notifyThread(threadId: string): void {
  const set = runtime.listenersByThread.get(threadId);
  if (!set) return;
  for (const l of set) l();
}

export function notifyChatCreated(threadId: string, newChatId: string): void {
  for (const l of runtime.chatCreatedListeners) l(threadId, newChatId);
}

export function createEmptyState(threadId: string): StreamState {
  return {
    threadId,
    chatId: null,
    transientUser: null,
    transientAssistant: null,
    isStreaming: false,
    streamError: null,
    lastPayload: null,
    lastEventSeq: 0,
  };
}

export function setState(threadId: string, updater: (current: StreamState) => StreamState): void {
  const current = runtime.states.get(threadId) ?? createEmptyState(threadId);
  runtime.states.set(threadId, updater(current));
  notifyThread(threadId);
}

export function getAttachmentStatus(status: TransientUserStatus) {
  if (status === 'pending') return 'uploading' as const;
  if (status === 'error') return 'error' as const;
  return 'sent' as const;
}

export function updateTransientUserStatus(
  user: TransientUserMessage | null,
  status: TransientUserStatus,
): TransientUserMessage | null {
  if (!user) return null;
  return {
    ...user,
    status,
    attachments: user.attachments.map((attachment) => ({
      ...attachment,
      status: getAttachmentStatus(status),
    })),
  };
}

export function getStreamSnapshot(threadId: string | null): StreamState | null {
  if (!threadId) return null;
  return runtime.states.get(threadId) ?? null;
}

export function subscribeStream(threadId: string | null, listener: Listener): () => void {
  if (!threadId) return () => undefined;
  let set = runtime.listenersByThread.get(threadId);
  if (!set) {
    set = new Set();
    runtime.listenersByThread.set(threadId, set);
  }
  set.add(listener);
  return () => {
    const s = runtime.listenersByThread.get(threadId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) runtime.listenersByThread.delete(threadId);
  };
}

export function subscribeChatCreated(listener: ChatCreatedListener): () => void {
  runtime.chatCreatedListeners.add(listener);
  return () => {
    runtime.chatCreatedListeners.delete(listener);
  };
}

export function subscribeFormPatch(threadId: string, listener: FormPatchListener): () => void {
  let set = runtime.formPatchListenersByThread.get(threadId);
  if (!set) {
    set = new Set();
    runtime.formPatchListenersByThread.set(threadId, set);
  }
  set.add(listener);
  return () => {
    const current = runtime.formPatchListenersByThread.get(threadId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) runtime.formPatchListenersByThread.delete(threadId);
  };
}

export function notifyFormPatch(
  threadId: string,
  patch: import('./agent-chat-events').FormPatchPayload,
): void {
  const set = runtime.formPatchListenersByThread.get(threadId);
  if (!set) return;
  for (const listener of set) listener(threadId, patch);
}

export type ThreadRoomListener = (rooms: ReadonlySet<string>) => void;

export function notifyRoomListeners(): void {
  const snapshot: ReadonlySet<string> = new Set(runtime.threadRoomRefCounts.keys());
  for (const listener of runtime.threadRoomListeners) listener(snapshot);
}

/**
 * Marks a thread as "interesting" so the Provider can join the corresponding
 * Socket.IO chat room. Returns a cleanup that decrements the refcount; when
 * it reaches zero the Provider will leave the room.
 */
export function subscribeThreadRoom(threadId: string): () => void {
  const next = (runtime.threadRoomRefCounts.get(threadId) ?? 0) + 1;
  runtime.threadRoomRefCounts.set(threadId, next);
  if (next === 1) notifyRoomListeners();
  return () => {
    const current = runtime.threadRoomRefCounts.get(threadId) ?? 0;
    if (current <= 1) {
      runtime.threadRoomRefCounts.delete(threadId);
      notifyRoomListeners();
    } else {
      runtime.threadRoomRefCounts.set(threadId, current - 1);
    }
  };
}

export function subscribeThreadRoomChanges(listener: ThreadRoomListener): () => void {
  runtime.threadRoomListeners.add(listener);
  return () => {
    runtime.threadRoomListeners.delete(listener);
  };
}

export function getSubscribedThreadRooms(): ReadonlySet<string> {
  return new Set(runtime.threadRoomRefCounts.keys());
}

export function setStreamChatId(threadId: string, chatId: string | null): void {
  setState(threadId, (current) => ({ ...current, chatId }));
}

export function clearStreamError(threadId: string): void {
  setState(threadId, (current) => ({ ...current, streamError: null }));
}

export function applyEventToStream(threadId: string, event: AgentStreamEvent): void {
  if (event.type === 'chat_created' && event.chatId) {
    handleChatCreatedEvent(threadId, event.chatId);
    return;
  }
  if (event.type === 'form_patch' && event.formPatch) {
    notifyFormPatch(threadId, event.formPatch);
    return;
  }
  setState(threadId, (current) => {
    const base = current.transientAssistant ?? createInitialAssistant();
    return {
      ...current,
      transientAssistant: applyStreamEvent(base, event),
      lastEventSeq: current.lastEventSeq + 1,
    };
  });
}

export function handleChatCreatedEvent(threadId: string, newChatId: string): void {
  setState(threadId, (current) => ({
    ...current,
    chatId: newChatId,
    transientUser: updateTransientUserStatus(current.transientUser, 'sent'),
  }));
  consumePendingThreadId(threadId);
  notifyChatCreated(threadId, newChatId);
}

/**
 * Applies an event coming from a persisted source (catch-up REST or socket
 * live broadcast) along with its server-side `seq`. Events with `seq` lower
 * than or equal to `lastEventSeq` are ignored, so the function is safe to
 * call in any order between live and catch-up.
 */
export function applyEventWithSeq(
  threadId: string,
  event: AgentStreamEvent,
  seq: number,
): void {
  if (event.type === 'chat_created' && event.chatId) {
    handleChatCreatedEvent(threadId, event.chatId);
    setState(threadId, (current) => ({
      ...current,
      lastEventSeq: Math.max(current.lastEventSeq, seq),
    }));
    return;
  }
  setState(threadId, (current) => {
    if (seq <= current.lastEventSeq) return current;
    const base = current.transientAssistant ?? createInitialAssistant();
    return {
      ...current,
      transientAssistant: applyStreamEvent(base, event),
      lastEventSeq: seq,
    };
  });
}

export function clearExtractionReviewForContinuation(
  assistant: TransientAssistantMessage,
): TransientAssistantMessage {
  if (!assistant.extractionReview) return assistant;
  return { ...assistant, extractionReview: null };
}
