import type { ApiSuccessResponse, DosageChatListItem } from '@/types/dosage-chat';
import { capture } from '@/lib/analytics';
import {
  createInitialAssistant,
  createInitialUser,
} from '@/hooks/use-dosage-chat-stream-reducer';
import { streamAgentChat } from '@/lib/agent-chat-stream';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import {
  postAgentChatApprove,
  postAgentChatCancel,
  postAgentChatReject,
} from '@/generated/api/agent-chat/agent-chat';
import type { SendMessageInput } from './chat-stream-store.part-01-send-message-input';
import { applyEventToStream, clearExtractionReviewForContinuation, clearStreamError, consumePendingThreadId, notifyChatCreated, runtime, setState, setStreamChatId, updateTransientUserStatus } from './chat-stream-store.part-01-send-message-input';
import { resolveCreatedChatIdFromState } from './chat-stream-store.part-03-resolve-created-chat-id-from-state';

export async function cleanupAfterComplete(threadId: string): Promise<void> {
  const queryClient = runtime.queryClientRef;
  if (!queryClient) return;
  const state = runtime.states.get(threadId);
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
  if (runtime.states.get(threadId)?.isStreaming) {
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

  runtime.controllers.get(threadId)?.abort();
  const controller = new AbortController();
  runtime.controllers.set(threadId, controller);

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
    if (runtime.controllers.get(threadId) === controller) {
      runtime.controllers.delete(threadId);
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
  const state = runtime.states.get(threadId);
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
  const state = runtime.states.get(threadId);
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
  const state = runtime.states.get(threadId);
  if (!state?.lastPayload) return;
  capture('chat_stream_retried');
  clearStreamError(threadId);
  void startStream({ threadId, chatId, payload: state.lastPayload });
}

export function disposeAllStreams(): void {
  for (const c of runtime.controllers.values()) c.abort();
  runtime.controllers.clear();
}

export const RESUME_DEFAULT_LIMIT = 200;

export const TERMINAL_EVENT_TYPES: ReadonlySet<string> = new Set(['complete', 'error', 'cancelled']);

/**
 * Reconnects the client to the server's view of a thread's stream:
 *  1. fetch /stream-state to find out if a stream is in flight + lastSeq
 *  2. if streaming, fetch /stream-events?since=localLastSeq and replay them
 *
 * Safe to call multiple times: events are deduplicated by `seq` and the
 * function is a no-op when the server reports `isStreaming: false`.
 */
export interface ResumeStreamStateData {
  readonly chatId?: string | null;
  readonly isStreaming?: boolean;
  readonly lastSeq?: number;
  readonly lastStatus?: string | null;
}

export interface ResumeStreamEventsData {
  readonly events?: ReadonlyArray<{
    readonly seq: number;
    readonly type: string;
    readonly payload: Record<string, unknown>;
    readonly createdAt: string;
  }>;
}

export function unwrapGeneratedApiData<T>(response: unknown): T | undefined {
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

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const CHAT_ID_RESOLVE_DELAYS_MS = [150, 400, 800, 1500, 3000] as const;
