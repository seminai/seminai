import { useContext, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { SocketContext } from '@/lib/socket-store';
import {
  applyEventToStream,
  applyEventWithSeq,
  configureChatStreamStore,
  disposeAllStreams,
  getStreamSnapshot,
  getSubscribedThreadRooms,
  subscribeStream,
  subscribeThreadRoomChanges,
  type StreamState,
} from '@/lib/chat-stream-store';
import type {
  AgentStreamEvent,
  ExtractionReviewPayload,
  FormPatchPayload,
} from '@/lib/agent-chat-events';

interface AgentEventPayload {
  readonly event: AgentStreamEvent;
  readonly seq: number;
  readonly threadId: string;
}

interface ExtractionReviewPresentedPayload extends ExtractionReviewPayload {
  readonly threadId?: string;
  readonly timestamp?: number;
}

interface ExtractionReviewSavedPayload {
  readonly threadId?: string;
  readonly reviewId: string;
}

interface ExtractionReviewCancelledPayload {
  readonly threadId?: string;
  readonly reviewId: string;
}

interface ExtractionArchivedPayload {
  readonly threadId?: string;
  readonly extractionId: string;
  readonly archiveUrl: string;
}

interface ExtractionCompletePayload {
  readonly threadId?: string;
  readonly jobId: string;
}

interface ExtractionFailedPayload {
  readonly threadId?: string;
  readonly jobId: string;
  readonly error: string;
}

interface FormPatchSocketPayload {
  readonly threadId?: string;
  readonly formPatch?: FormPatchPayload;
}

export function ChatStreamProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const socket = useContext(SocketContext);

  useEffect(() => {
    configureChatStreamStore(queryClient);
    return () => {
      disposeAllStreams();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!socket) return;
    syncJoinedRooms(socket, getSubscribedThreadRooms());
    return subscribeThreadRoomChanges((rooms) => syncJoinedRooms(socket, rooms));
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    return wireSocketListeners(socket, queryClient);
  }, [socket, queryClient]);

  return <>{children}</>;
}

const joinedRooms = new Set<string>();

function syncJoinedRooms(socket: Socket, rooms: ReadonlySet<string>): void {
  for (const threadId of rooms) {
    if (!joinedRooms.has(threadId)) {
      socket.emit('join:chat', threadId);
      joinedRooms.add(threadId);
    }
  }
  for (const threadId of joinedRooms) {
    if (!rooms.has(threadId)) {
      socket.emit('leave:chat', threadId);
      joinedRooms.delete(threadId);
    }
  }
}

function wireSocketListeners(socket: Socket, queryClient: QueryClient): () => void {
  const onAgentEvent = (payload: AgentEventPayload) => {
    if (!payload || typeof payload.seq !== 'number' || typeof payload.threadId !== 'string') {
      return;
    }
    if (!payload.event || typeof payload.event.type !== 'string') return;
    applyEventWithSeq(payload.threadId, payload.event, payload.seq);
  };

  const onReviewPresented = (payload: ExtractionReviewPresentedPayload) => {
    if (!payload?.threadId) return;
    applyEventToStream(payload.threadId, {
      type: 'extraction_review_presented',
      extractionReview: payload,
    });
  };

  const onReviewSaved = (payload: ExtractionReviewSavedPayload) => {
    if (!payload?.threadId) return;
    applyEventToStream(payload.threadId, {
      type: 'extraction_review_saved',
      extractionReview: { reviewId: payload.reviewId } as ExtractionReviewPayload,
    });
  };

  const onReviewCancelled = (payload: ExtractionReviewCancelledPayload) => {
    if (!payload?.threadId) return;
    applyEventToStream(payload.threadId, {
      type: 'extraction_review_cancelled',
      extractionReview: { reviewId: payload.reviewId } as ExtractionReviewPayload,
    });
  };

  const onExtractionArchived = (payload: ExtractionArchivedPayload) => {
    if (!payload?.threadId) return;
    applyEventToStream(payload.threadId, {
      type: 'extraction_archived',
    });
    void queryClient.invalidateQueries({ queryKey: ['file-extractions'] });
    void queryClient.invalidateQueries({ queryKey: ['chats'] });
    invalidateChatDetailForThread(queryClient, payload.threadId);
  };

  const onExtractionComplete = (payload: ExtractionCompletePayload) => {
    void queryClient.invalidateQueries({ queryKey: ['chats'] });
    if (payload?.threadId) invalidateChatDetailForThread(queryClient, payload.threadId);
  };

  const onExtractionFailed = (payload: ExtractionFailedPayload) => {
    void queryClient.invalidateQueries({ queryKey: ['chats'] });
    if (payload?.threadId) invalidateChatDetailForThread(queryClient, payload.threadId);
  };

  const onFormPatch = (payload: FormPatchSocketPayload) => {
    if (!payload?.threadId || !payload.formPatch) return;
    applyEventToStream(payload.threadId, {
      type: 'form_patch',
      formPatch: payload.formPatch,
    });
  };

  socket.on('agent:event', onAgentEvent);
  socket.on('agent:extraction_review_presented', onReviewPresented);
  socket.on('agent:extraction_review_saved', onReviewSaved);
  socket.on('agent:extraction_review_cancelled', onReviewCancelled);
  socket.on('agent:extraction_archived', onExtractionArchived);
  socket.on('agent:extraction_complete', onExtractionComplete);
  socket.on('agent:extraction_failed', onExtractionFailed);
  socket.on('agent:form_patch', onFormPatch);

  return () => {
    socket.off('agent:event', onAgentEvent);
    socket.off('agent:extraction_review_presented', onReviewPresented);
    socket.off('agent:extraction_review_saved', onReviewSaved);
    socket.off('agent:extraction_review_cancelled', onReviewCancelled);
    socket.off('agent:extraction_archived', onExtractionArchived);
    socket.off('agent:extraction_complete', onExtractionComplete);
    socket.off('agent:extraction_failed', onExtractionFailed);
    socket.off('agent:form_patch', onFormPatch);
  };
}

function invalidateChatDetailForThread(queryClient: QueryClient, threadId: string): void {
  const snapshot = getStreamSnapshot(threadId);
  if (snapshot?.chatId) {
    void queryClient.invalidateQueries({ queryKey: ['chat', snapshot.chatId] });
  }
}

export function useChatStreamState(threadId: string | null): StreamState | null {
  return useSyncExternalStore(
    (listener) => subscribeStream(threadId, listener),
    () => getStreamSnapshot(threadId),
    () => null,
  );
}
