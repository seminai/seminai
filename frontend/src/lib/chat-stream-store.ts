import type { QueryClient } from '@tanstack/react-query';
import {
  getAgentChatThreadsThreadIdStreamEvents,
  getAgentChatThreadsThreadIdStreamState,
  postAgentChatApprove,
  postAgentChatCancel,
  postAgentChatReject,
} from '@/generated/api/agent-chat/agent-chat';
import type { AgentStreamEvent } from '@/lib/agent-chat-events';
import { capture } from '@/lib/analytics';
import { streamAgentChat } from '@/lib/agent-chat-stream';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import {
  applyStreamEvent,
  createInitialAssistant,
  createInitialUser,
} from '@/hooks/use-dosage-chat-stream-reducer';
import type {
  TransientAssistantMessage,
  TransientUserStatus,
  TransientUserMessage,
} from '@/types/chat-stream';
import type { ApiSuccessResponse, DosageChatListItem } from '@/types/dosage-chat';
import type { MentionItem } from '@/types/mention';

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

type Listener = () => void;
export type ChatCreatedListener = (threadId: string, newChatId: string) => void;
export type FormPatchListener = (
  threadId: string,
  patch: import('./agent-chat-events').FormPatchPayload,
) => void;

const states = new Map<string, StreamState>();
const listenersByThread = new Map<string, Set<Listener>>();
const controllers = new Map<string, AbortController>();
const chatCreatedListeners = new Set<ChatCreatedListener>();
const formPatchListenersByThread = new Map<string, Set<FormPatchListener>>();

let queryClientRef: QueryClient | null = null;
let pendingNewChatThreadId: string | null = null;

export function configureChatStreamStore(qc: QueryClient): void {
  queryClientRef = qc;
}

export function getOrCreatePendingThreadId(): string {
  if (!pendingNewChatThreadId) {
    pendingNewChatThreadId = crypto.randomUUID();
  }
  return pendingNewChatThreadId;
}

export function consumePendingThreadId(threadId: string): void {
  if (pendingNewChatThreadId === threadId) {
    pendingNewChatThreadId = null;
  }
}

function notifyThread(threadId: string): void {
  const set = listenersByThread.get(threadId);
  if (!set) return;
  for (const l of set) l();
}

function notifyChatCreated(threadId: string, newChatId: string): void {
  for (const l of chatCreatedListeners) l(threadId, newChatId);
}

function createEmptyState(threadId: string): StreamState {
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

function setState(threadId: string, updater: (current: StreamState) => StreamState): void {
  const current = states.get(threadId) ?? createEmptyState(threadId);
  states.set(threadId, updater(current));
  notifyThread(threadId);
}

function getAttachmentStatus(status: TransientUserStatus) {
  if (status === 'pending') return 'uploading' as const;
  if (status === 'error') return 'error' as const;
  return 'sent' as const;
}

function updateTransientUserStatus(
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
  return states.get(threadId) ?? null;
}

export function subscribeStream(threadId: string | null, listener: Listener): () => void {
  if (!threadId) return () => undefined;
  let set = listenersByThread.get(threadId);
  if (!set) {
    set = new Set();
    listenersByThread.set(threadId, set);
  }
  set.add(listener);
  return () => {
    const s = listenersByThread.get(threadId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) listenersByThread.delete(threadId);
  };
}

export function subscribeChatCreated(listener: ChatCreatedListener): () => void {
  chatCreatedListeners.add(listener);
  return () => {
    chatCreatedListeners.delete(listener);
  };
}

export function subscribeFormPatch(threadId: string, listener: FormPatchListener): () => void {
  let set = formPatchListenersByThread.get(threadId);
  if (!set) {
    set = new Set();
    formPatchListenersByThread.set(threadId, set);
  }
  set.add(listener);
  return () => {
    const current = formPatchListenersByThread.get(threadId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) formPatchListenersByThread.delete(threadId);
  };
}

function notifyFormPatch(
  threadId: string,
  patch: import('./agent-chat-events').FormPatchPayload,
): void {
  const set = formPatchListenersByThread.get(threadId);
  if (!set) return;
  for (const listener of set) listener(threadId, patch);
}

const threadRoomRefCounts = new Map<string, number>();
type ThreadRoomListener = (rooms: ReadonlySet<string>) => void;
const threadRoomListeners = new Set<ThreadRoomListener>();

function notifyRoomListeners(): void {
  const snapshot: ReadonlySet<string> = new Set(threadRoomRefCounts.keys());
  for (const listener of threadRoomListeners) listener(snapshot);
}

/**
 * Marks a thread as "interesting" so the Provider can join the corresponding
 * Socket.IO chat room. Returns a cleanup that decrements the refcount; when
 * it reaches zero the Provider will leave the room.
 */
export function subscribeThreadRoom(threadId: string): () => void {
  const next = (threadRoomRefCounts.get(threadId) ?? 0) + 1;
  threadRoomRefCounts.set(threadId, next);
  if (next === 1) notifyRoomListeners();
  return () => {
    const current = threadRoomRefCounts.get(threadId) ?? 0;
    if (current <= 1) {
      threadRoomRefCounts.delete(threadId);
      notifyRoomListeners();
    } else {
      threadRoomRefCounts.set(threadId, current - 1);
    }
  };
}

export function subscribeThreadRoomChanges(listener: ThreadRoomListener): () => void {
  threadRoomListeners.add(listener);
  return () => {
    threadRoomListeners.delete(listener);
  };
}

export function getSubscribedThreadRooms(): ReadonlySet<string> {
  return new Set(threadRoomRefCounts.keys());
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

function handleChatCreatedEvent(threadId: string, newChatId: string): void {
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

async function cleanupAfterComplete(threadId: string): Promise<void> {
  const queryClient = queryClientRef;
  if (!queryClient) return;
  const state = states.get(threadId);
  if (!state) return;

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['chats'] }),
    state.chatId
      ? queryClient.invalidateQueries({ queryKey: ['chat', state.chatId] })
      : Promise.resolve(),
  ]);

  if (!state.chatId) {
    const refreshed = await queryClient.fetchQuery<
      ApiSuccessResponse<readonly DosageChatListItem[]>
    >({ queryKey: ['chats', { category: 'DOSAGE_AGENT' }] });
    const newChat = refreshed?.data?.find((c) => c.threadId === threadId);
    if (newChat) {
      setStreamChatId(threadId, newChat.id);
      consumePendingThreadId(threadId);
      notifyChatCreated(threadId, newChat.id);
    }
  } else {
    await queryClient.refetchQueries({ queryKey: ['chat', state.chatId] });
  }

  setState(threadId, (current) => {
    const review = current.transientAssistant?.extractionReview;
    if (review?.status === 'editing') {
      return { ...current, transientUser: null };
    }
    return { ...current, transientUser: null, transientAssistant: null };
  });
}

export interface StartStreamInput {
  readonly threadId: string;
  readonly chatId: string | null;
  readonly payload: SendMessageInput;
}

export async function startStream(input: StartStreamInput): Promise<void> {
  const { threadId, chatId, payload } = input;
  const trimmed = payload.message.trim();
  if (!trimmed) {
    setState(threadId, (current) => ({
      ...current,
      streamError: 'Inserisci un messaggio prima di inviare.',
    }));
    return;
  }
  if (states.get(threadId)?.isStreaming) {
    setState(threadId, (current) => ({
      ...current,
      streamError: "Attendi che l'agente finisca di rispondere.",
    }));
    return;
  }

  capture('chat_message_sent', {
    has_files: Boolean(payload.files?.length),
    file_count: payload.files?.length ?? 0,
    mention_count: payload.mentions?.length ?? 0,
    is_new_chat: chatId === null,
  });

  controllers.get(threadId)?.abort();
  const controller = new AbortController();
  controllers.set(threadId, controller);

  setState(threadId, (current) => ({
    ...current,
    chatId,
    transientUser: createInitialUser(trimmed, payload.files ?? []),
    transientAssistant: createInitialAssistant(),
    isStreaming: true,
    streamError: null,
    lastPayload: { ...payload, message: trimmed },
    lastEventSeq: 0,
  }));

  const chatIdResolver = chatId ? Promise.resolve() : resolveCreatedChatIdFromState(threadId);

  try {
    await streamAgentChat(
      {
        threadId,
        message: trimmed,
        files: payload.files,
        mentions: payload.mentions,
        clientContext: payload.clientContext,
        workspaceId: payload.workspaceId,
      },
      (event) => applyEventToStream(threadId, event),
      controller.signal,
    );
    await chatIdResolver;
    await cleanupAfterComplete(threadId);
  } catch (err) {
    if (controller.signal.aborted) return;
    const message =
      err instanceof Error ? sanitizeUserFacingText(err.message) : 'Errore di rete.';
    setState(threadId, (current) => ({
      ...current,
      transientUser:
        current.transientUser?.status === 'pending'
          ? updateTransientUserStatus(current.transientUser, 'error')
          : current.transientUser,
      transientAssistant: current.transientAssistant
        ? { ...current.transientAssistant, status: 'error', errorMessage: message }
        : current.transientAssistant,
      streamError: message,
    }));
  } finally {
    if (!controller.signal.aborted) {
      setState(threadId, (current) => ({ ...current, isStreaming: false }));
    }
    if (controllers.get(threadId) === controller) {
      controllers.delete(threadId);
    }
  }
}

export function abortStream(threadId: string): void {
  capture('chat_stream_aborted');
  setState(threadId, (current) => ({
    ...current,
    isStreaming: false,
    transientAssistant: current.transientAssistant
      ? { ...current.transientAssistant, status: 'cancelled' }
      : current.transientAssistant,
  }));
  void postAgentChatCancel({ threadId }).catch(() => undefined);
}

export async function approveStream(threadId: string): Promise<void> {
  const state = states.get(threadId);
  if (!state) return;
  const isAwaitingApproval = state.transientAssistant?.status === 'requires_approval';
  if (state.isStreaming && !isAwaitingApproval) return;
  capture('approval_submitted');
  setState(threadId, (current) => ({
    ...current,
    isStreaming: true,
    transientAssistant: current.transientAssistant
      ? {
          ...clearExtractionReviewForContinuation(current.transientAssistant),
          status: 'streaming',
          pendingToolCalls: [],
        }
      : createInitialAssistant(),
  }));
  try {
    await postAgentChatApprove({ threadId });
    await cleanupAfterComplete(threadId);
  } catch (err) {
    const message =
      err instanceof Error ? sanitizeUserFacingText(err.message) : 'Approvazione fallita.';
    setState(threadId, (current) => ({
      ...current,
      streamError: message,
      transientAssistant: current.transientAssistant
        ? { ...current.transientAssistant, status: 'error', errorMessage: message }
        : current.transientAssistant,
    }));
  } finally {
    setState(threadId, (current) => ({ ...current, isStreaming: false }));
  }
}

export async function rejectStream(threadId: string, reason?: string): Promise<void> {
  const state = states.get(threadId);
  if (!state) return;
  const isAwaitingApproval = state.transientAssistant?.status === 'requires_approval';
  if (state.isStreaming && !isAwaitingApproval) return;
  capture('rejection_submitted', { has_reason: Boolean(reason && reason.trim()) });
  setState(threadId, (current) => ({
    ...current,
    isStreaming: true,
    transientAssistant: current.transientAssistant
      ? clearExtractionReviewForContinuation(current.transientAssistant)
      : current.transientAssistant,
  }));
  try {
    await postAgentChatReject({ threadId, reason });
    await cleanupAfterComplete(threadId);
  } catch (err) {
    const message =
      err instanceof Error ? sanitizeUserFacingText(err.message) : 'Rifiuto fallito.';
    setState(threadId, (current) => ({ ...current, streamError: message }));
  } finally {
    setState(threadId, (current) => ({ ...current, isStreaming: false }));
  }
}

export function retryStream(threadId: string, chatId: string | null): void {
  const state = states.get(threadId);
  if (!state?.lastPayload) return;
  capture('chat_stream_retried');
  clearStreamError(threadId);
  void startStream({ threadId, chatId, payload: state.lastPayload });
}

export function disposeAllStreams(): void {
  for (const c of controllers.values()) c.abort();
  controllers.clear();
}

const RESUME_DEFAULT_LIMIT = 200;
const TERMINAL_EVENT_TYPES: ReadonlySet<string> = new Set(['complete', 'error', 'cancelled']);

/**
 * Reconnects the client to the server's view of a thread's stream:
 *  1. fetch /stream-state to find out if a stream is in flight + lastSeq
 *  2. if streaming, fetch /stream-events?since=localLastSeq and replay them
 *
 * Safe to call multiple times: events are deduplicated by `seq` and the
 * function is a no-op when the server reports `isStreaming: false`.
 */
interface ResumeStreamStateData {
  readonly chatId?: string | null;
  readonly isStreaming?: boolean;
  readonly lastSeq?: number;
  readonly lastStatus?: string | null;
}

interface ResumeStreamEventsData {
  readonly events?: ReadonlyArray<{
    readonly seq: number;
    readonly type: string;
    readonly payload: Record<string, unknown>;
    readonly createdAt: string;
  }>;
}

function unwrapGeneratedApiData<T>(response: unknown): T | undefined {
  const generatedData = (response as { readonly data?: unknown } | null)?.data;
  if (!generatedData || typeof generatedData !== 'object') {
    return generatedData as T | undefined;
  }

  const apiEnvelope = generatedData as { readonly status?: unknown; readonly data?: unknown };
  if (typeof apiEnvelope.status === 'string' && 'data' in apiEnvelope) {
    return apiEnvelope.data as T | undefined;
  }

  return generatedData as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CHAT_ID_RESOLVE_DELAYS_MS = [150, 400, 800, 1500, 3000] as const;

async function resolveCreatedChatIdFromState(threadId: string): Promise<void> {
  for (const delayMs of CHAT_ID_RESOLVE_DELAYS_MS) {
    if (states.get(threadId)?.chatId) return;
    await delay(delayMs);
    if (states.get(threadId)?.chatId) return;

    try {
      const stateResponse = await getAgentChatThreadsThreadIdStreamState(threadId);
      const state = unwrapGeneratedApiData<ResumeStreamStateData>(stateResponse);
      if (state?.chatId) {
        handleChatCreatedEvent(threadId, state.chatId);
        return;
      }
    } catch {
      // Best-effort fallback: SSE/socket and final cleanup still cover this path.
    }
  }
}

function isTerminalStatus(lastStatus: string | null): boolean {
  if (!lastStatus) return false;
  return TERMINAL_EVENT_TYPES.has(lastStatus === 'completed' ? 'complete' : lastStatus);
}

export async function resumeStream(threadId: string): Promise<void> {
  try {
    const stateResponse = await getAgentChatThreadsThreadIdStreamState(threadId);
    const state = unwrapGeneratedApiData<ResumeStreamStateData>(stateResponse);
    if (!state) return;
    if (state.chatId) {
      setStreamChatId(threadId, state.chatId);
    }
    const isStreamingServer = state.isStreaming === true;
    const serverLastSeq = typeof state.lastSeq === 'number' ? state.lastSeq : 0;
    const local = states.get(threadId);
    const localLastSeq = local?.lastEventSeq ?? 0;
    const lastStatus = typeof state.lastStatus === 'string' ? state.lastStatus : null;
    const isTerminalServerState = isTerminalStatus(lastStatus);
    const shouldFetch = isStreamingServer || serverLastSeq > localLastSeq;
    if (!shouldFetch) {
      if (isTerminalServerState) {
        setState(threadId, (current) => ({ ...current, isStreaming: false }));
        await cleanupAfterComplete(threadId);
      }
      return;
    }
    setState(threadId, (current) => ({
      ...current,
      isStreaming: isStreamingServer,
      transientAssistant: current.transientAssistant ?? createInitialAssistant(),
    }));
    const eventsResponse = await getAgentChatThreadsThreadIdStreamEvents(threadId, {
      since: localLastSeq,
      limit: RESUME_DEFAULT_LIMIT,
    });
    const eventsData = unwrapGeneratedApiData<ResumeStreamEventsData>(eventsResponse);
    const events = eventsData?.events ?? [];
    for (const row of events) {
      if (typeof row.seq !== 'number' || !row.payload || typeof row.type !== 'string') continue;
      applyEventWithSeq(threadId, row.payload as unknown as AgentStreamEvent, row.seq);
    }
    if (isTerminalServerState) {
      setState(threadId, (current) => ({ ...current, isStreaming: false }));
      await cleanupAfterComplete(threadId);
    }
  } catch {
    // Resume is best-effort: if state/events fetch fails the user can retry
    // by sending a new message. Avoid surfacing this as a stream error.
  }
}
