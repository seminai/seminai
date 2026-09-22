import { useCallback, useEffect } from 'react';
import {
  abortStream,
  applyEventToStream,
  approveStream,
  clearStreamError as storeClearError,
  rejectStream,
  resumeStream,
  retryStream,
  setStreamChatId,
  startStream,
  subscribeChatCreated,
  subscribeThreadRoom,
  type SendMessageInput,
} from '@/lib/chat-stream-store';
import type { AgentStreamEvent } from '@/lib/agent-chat-events';
import type {
  TransientAssistantMessage,
  TransientUserMessage,
} from '@/types/chat-stream';
import { useChatStreamState } from './use-chat-stream';

export type { SendMessageInput };

export interface UseDosageChatStreamInput {
  readonly threadId: string | null;
  readonly chatId: string | null;
  readonly localThreadId: string;
  readonly onChatCreated?: (newChatId: string) => void;
}

export interface UseDosageChatStreamResult {
  readonly transientUser: TransientUserMessage | null;
  readonly transientAssistant: TransientAssistantMessage | null;
  readonly isStreaming: boolean;
  readonly streamError: string | null;
  readonly sendMessage: (input: SendMessageInput) => void;
  readonly approve: () => void;
  readonly reject: (reason?: string) => void;
  readonly retry: () => void;
  readonly cancel: () => void;
  readonly clearStreamError: () => void;
  readonly applyReviewEvent: (event: AgentStreamEvent) => void;
}

export function useDosageChatStream(
  input: UseDosageChatStreamInput,
): UseDosageChatStreamResult {
  const { threadId, chatId, localThreadId, onChatCreated } = input;
  const effectiveThreadId = threadId ?? localThreadId;

  const state = useChatStreamState(effectiveThreadId);

  useEffect(() => {
    if (!chatId) return;
    setStreamChatId(effectiveThreadId, chatId);
  }, [effectiveThreadId, chatId]);

  useEffect(() => {
    if (!effectiveThreadId) return;
    void resumeStream(effectiveThreadId);
  }, [effectiveThreadId]);

  useEffect(() => {
    if (!effectiveThreadId) return;
    return subscribeThreadRoom(effectiveThreadId);
  }, [effectiveThreadId]);

  useEffect(() => {
    if (!onChatCreated) return;
    console.debug('[use-dosage-chat-stream] subscribing chatCreated for localThreadId', localThreadId);
    return subscribeChatCreated((eventThreadId, newChatId) => {
      console.debug('[use-dosage-chat-stream] chatCreated received', {
        eventThreadId,
        localThreadId,
        match: eventThreadId === localThreadId,
        newChatId,
      });
      if (eventThreadId !== localThreadId) return;
      onChatCreated(newChatId);
    });
  }, [localThreadId, onChatCreated]);

  const sendMessage = useCallback(
    (payload: SendMessageInput) => {
      void startStream({ threadId: effectiveThreadId, chatId, payload });
    },
    [effectiveThreadId, chatId],
  );

  const approve = useCallback(() => {
    void approveStream(effectiveThreadId);
  }, [effectiveThreadId]);

  const reject = useCallback(
    (reason?: string) => {
      void rejectStream(effectiveThreadId, reason);
    },
    [effectiveThreadId],
  );

  const retry = useCallback(() => {
    retryStream(effectiveThreadId, chatId);
  }, [effectiveThreadId, chatId]);

  const cancel = useCallback(() => {
    abortStream(effectiveThreadId);
  }, [effectiveThreadId]);

  const clearStreamError = useCallback(() => {
    storeClearError(effectiveThreadId);
  }, [effectiveThreadId]);

  const applyReviewEvent = useCallback(
    (event: AgentStreamEvent) => {
      applyEventToStream(effectiveThreadId, event);
    },
    [effectiveThreadId],
  );

  return {
    transientUser: state?.transientUser ?? null,
    transientAssistant: state?.transientAssistant ?? null,
    isStreaming: state?.isStreaming ?? false,
    streamError: state?.streamError ?? null,
    sendMessage,
    approve,
    reject,
    retry,
    cancel,
    clearStreamError,
    applyReviewEvent,
  };
}
