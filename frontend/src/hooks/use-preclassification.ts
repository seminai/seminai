import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SocketContext } from '@/lib/socket-store';
import { customFetch } from '@/lib/api-client';
import type {
  PreclassificationDoneEvent,
  PreclassificationItemErrorEvent,
  PreclassificationItemEvent,
  PreclassificationStatusItem,
  PreclassificationStatusResponse,
  PreclassificationSuggestion,
} from '@/types/preclassification';

const POLL_TRIGGER_MS = 5000;
const POLL_INTERVAL_MS = 3000;

function toSuggestion(
  item: PreclassificationStatusItem | PreclassificationItemEvent,
): PreclassificationSuggestion {
  return {
    status: item.status,
    documentCategory: item.documentCategory,
    categoryConfidence: item.categoryConfidence,
    companyId: item.companyId,
    companyConfidence: item.companyConfidence,
  };
}

/**
 * Subscribes to pre-classification suggestions for a `preclassId` via Socket.IO,
 * falling back to REST polling on `/extractions/preclassify/:id/status` when no
 * socket event arrives within POLL_TRIGGER_MS. Mirrors `useExtractionProgress`.
 * An immediate snapshot fetch on mount also catches results already cached
 * server-side before the socket room was joined.
 */
export function usePreclassification(preclassId: string | null) {
  const socket = useContext(SocketContext);
  const [suggestions, setSuggestions] = useState<ReadonlyMap<string, PreclassificationSuggestion>>(
    new Map(),
  );
  const armRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const upsert = useCallback((itemId: string, suggestion: PreclassificationSuggestion) => {
    setSuggestions((prev) => {
      const next = new Map(prev);
      next.set(itemId, suggestion);
      return next;
    });
  }, []);

  const stopPolling = useCallback(() => {
    if (armRef.current != null) window.clearTimeout(armRef.current);
    if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    armRef.current = null;
    intervalRef.current = null;
  }, []);

  const cancelArm = useCallback(() => {
    if (armRef.current == null) return;
    window.clearTimeout(armRef.current);
    armRef.current = null;
  }, []);

  const pollOnce = useCallback(
    async (id: string): Promise<void> => {
      try {
        const res = await customFetch<PreclassificationStatusResponse>({
          url: `/extractions/preclassify/${id}/status`,
          method: 'GET',
        });
        setSuggestions((prev) => {
          const next = new Map(prev);
          for (const item of res.data.items) next.set(item.itemId, toSuggestion(item));
          return next;
        });
        if (res.data.items.every((item) => item.status !== 'pending')) stopPolling();
      } catch {
        /* transient/404 — next tick may succeed; socket events still flow */
      }
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (id: string) => {
      if (intervalRef.current != null) return;
      cancelArm();
      intervalRef.current = window.setInterval(() => void pollOnce(id), POLL_INTERVAL_MS);
      void pollOnce(id);
    },
    [cancelArm, pollOnce],
  );

  // Near-immediate snapshot (catches results cached before we joined) + armed fallback
  // poll. The snapshot is deferred via setTimeout so the effect body stays side-effect
  // free. preclassId only transitions null -> value once per upload session.
  useEffect(() => {
    if (!preclassId) return;
    const snapshotTimer = window.setTimeout(() => void pollOnce(preclassId), 0);
    armRef.current = window.setTimeout(() => startPolling(preclassId), POLL_TRIGGER_MS);
    return () => {
      window.clearTimeout(snapshotTimer);
      stopPolling();
    };
  }, [preclassId, pollOnce, startPolling, stopPolling]);

  // Real-time socket subscription.
  useEffect(() => {
    if (!socket || !preclassId) return;
    socket.emit('join:preclassify', preclassId);
    const handleItem = (event: PreclassificationItemEvent) => {
      if (event.preclassId !== preclassId) return;
      cancelArm();
      upsert(event.itemId, toSuggestion(event));
    };
    const handleError = (event: PreclassificationItemErrorEvent) => {
      if (event.preclassId !== preclassId) return;
      cancelArm();
      upsert(event.itemId, {
        status: 'error',
        documentCategory: null,
        categoryConfidence: 0,
        companyId: null,
        companyConfidence: 0,
      });
    };
    const handleDone = (event: PreclassificationDoneEvent) => {
      if (event.preclassId !== preclassId) return;
      stopPolling();
    };
    socket.on('preclassify:item', handleItem);
    socket.on('preclassify:item:error', handleError);
    socket.on('preclassify:done', handleDone);
    return () => {
      socket.off('preclassify:item', handleItem);
      socket.off('preclassify:item:error', handleError);
      socket.off('preclassify:done', handleDone);
      socket.emit('leave:preclassify', preclassId);
    };
  }, [socket, preclassId, cancelArm, upsert, stopPolling]);

  const isClassifying = useMemo(() => {
    if (!preclassId) return false;
    const values = [...suggestions.values()];
    return values.length === 0 || values.some((suggestion) => suggestion.status === 'pending');
  }, [preclassId, suggestions]);

  return { suggestions, isClassifying };
}
