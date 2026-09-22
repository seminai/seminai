import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SocketContext } from '@/lib/socket-store';
import { extractionKeys } from '@/hooks/use-extractions';
import { customFetch } from '@/lib/api-client';
import type {
  ExtractionProgressEvent,
  ExtractionCompletedEvent,
  ExtractionErrorEvent,
} from '@/types/extraction';

export interface ExtractionProgressState {
  readonly progress: number;
  readonly status: 'loading' | 'completed' | 'error';
  readonly error?: string;
}

interface BatchStatusItem {
  readonly extractionId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly status: string;
  readonly progress: number;
  readonly error: string | null;
}

interface BatchStatusResponse {
  readonly status: string;
  readonly data: { readonly batchId: string; readonly items: readonly BatchStatusItem[] };
}

const POLL_TRIGGER_MS = 5000;
const POLL_INTERVAL_MS = 3000;

interface BatchPoller {
  armTimer: number | null;
  interval: number | null;
}

function mapServerStatus(status: string): ExtractionProgressState['status'] {
  if (status === 'PENDING_CONFIRMATION' || status === 'CONFIRMED') return 'completed';
  if (status === 'ERROR') return 'error';
  return 'loading';
}

/**
 * Subscribes to Socket.IO rooms for real-time extraction progress.
 * Falls back to REST polling on `/extractions/batch/:batchId/status` if no
 * socket events arrive within POLL_TRIGGER_MS — covers the case where
 * WebSockets are blocked by a proxy/firewall or the dev reconnect storm
 * delays the first event.
 */
export function useExtractionProgress(batchIds: readonly string[]) {
  const socket = useContext(SocketContext);
  const queryClient = useQueryClient();
  const [progressMap, setProgressMap] = useState<ReadonlyMap<string, ExtractionProgressState>>(
    new Map(),
  );
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const pollersRef = useRef<Map<string, BatchPoller>>(new Map());

  const updateEntry = useCallback(
    (extractionId: string, update: Partial<ExtractionProgressState>) => {
      setProgressMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(extractionId) ?? { progress: 0, status: 'loading' as const };
        next.set(extractionId, { ...existing, ...update });
        return next;
      });
    },
    [],
  );

  const stopPolling = useCallback((batchId: string) => {
    const entry = pollersRef.current.get(batchId);
    if (!entry) return;
    if (entry.armTimer != null) window.clearTimeout(entry.armTimer);
    if (entry.interval != null) window.clearInterval(entry.interval);
    pollersRef.current.delete(batchId);
  }, []);

  const pollOnce = useCallback(
    async (batchId: string): Promise<void> => {
      try {
        const res = await customFetch<BatchStatusResponse>({
          url: `/extractions/batch/${batchId}/status`,
          method: 'GET',
        });
        let allDone = true;
        for (const item of res.data.items) {
          const status = mapServerStatus(item.status);
          updateEntry(item.extractionId, {
            progress: item.progress,
            status,
            error: item.error ?? undefined,
          });
          if (status === 'loading') allDone = false;
        }
        if (allDone) {
          stopPolling(batchId);
          queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
        }
      } catch {
        /* keep the interval running — next tick may succeed */
      }
    },
    [updateEntry, queryClient, stopPolling],
  );

  const startPolling = useCallback(
    (batchId: string) => {
      const entry = pollersRef.current.get(batchId);
      if (!entry || entry.interval != null) return;
      entry.armTimer = null;
      entry.interval = window.setInterval(() => {
        void pollOnce(batchId);
      }, POLL_INTERVAL_MS);
      void pollOnce(batchId);
    },
    [pollOnce],
  );

  const cancelArm = useCallback((batchId: string) => {
    const entry = pollersRef.current.get(batchId);
    if (!entry || entry.armTimer == null) return;
    window.clearTimeout(entry.armTimer);
    entry.armTimer = null;
  }, []);

  // Arm a fallback poll for each new batchId.
  useEffect(() => {
    for (const batchId of batchIds) {
      if (pollersRef.current.has(batchId)) continue;
      const armTimer = window.setTimeout(() => startPolling(batchId), POLL_TRIGGER_MS);
      pollersRef.current.set(batchId, { armTimer, interval: null });
    }
  }, [batchIds, startPolling]);

  // Subscribe to Socket.IO events.
  useEffect(() => {
    if (!socket) return;
    const joinedRooms = joinedRoomsRef.current;
    const roomsToJoin = batchIds.filter((id) => !joinedRooms.has(id));
    for (const batchId of roomsToJoin) {
      socket.emit('join:extraction', batchId);
      joinedRooms.add(batchId);
    }
    const handleProgress = (event: ExtractionProgressEvent) => {
      cancelArm(event.batchId);
      updateEntry(event.extractionId, { progress: event.progress, status: 'loading' });
    };
    const handleCompleted = (event: ExtractionCompletedEvent) => {
      cancelArm(event.batchId);
      updateEntry(event.extractionId, { progress: 100, status: 'completed' });
      queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
    };
    const handleError = (event: ExtractionErrorEvent) => {
      cancelArm(event.batchId);
      updateEntry(event.extractionId, { status: 'error', error: event.error });
      queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
    };
    const handleDone = () => {
      queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
    };
    socket.on('extraction:progress', handleProgress);
    socket.on('extraction:completed', handleCompleted);
    socket.on('extraction:error', handleError);
    socket.on('extraction:done', handleDone);
    return () => {
      socket.off('extraction:progress', handleProgress);
      socket.off('extraction:completed', handleCompleted);
      socket.off('extraction:error', handleError);
      socket.off('extraction:done', handleDone);
      for (const batchId of joinedRooms) {
        socket.emit('leave:extraction', batchId);
      }
      joinedRooms.clear();
    };
  }, [socket, batchIds, updateEntry, queryClient, cancelArm]);

  // Cleanup all pollers on unmount.
  useEffect(() => {
    const pollers = pollersRef.current;
    return () => {
      for (const [, p] of pollers) {
        if (p.armTimer != null) window.clearTimeout(p.armTimer);
        if (p.interval != null) window.clearInterval(p.interval);
      }
      pollers.clear();
    };
  }, []);

  const getProgress = useCallback(
    (extractionId: string): ExtractionProgressState | undefined => progressMap.get(extractionId),
    [progressMap],
  );

  return { progressMap, getProgress };
}
