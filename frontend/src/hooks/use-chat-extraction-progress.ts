import { useContext, useEffect, useState } from 'react';
import { SocketContext } from '@/lib/socket-store';

export interface ChatExtractionProgressEntry {
  readonly jobId: string;
  readonly progress: number;
  readonly step: string;
  readonly updatedAt: number;
}

interface ProgressPayload {
  readonly jobId: string;
  readonly progress: number;
  readonly step: string;
  readonly timestamp: number;
}

interface CompletionPayload {
  readonly jobId: string;
}

/**
 * Subscribes to `agent:extraction_progress` for the chat-driven async
 * extraction worker and clears entries on `agent:extraction_complete` /
 * `agent:extraction_failed`. Returns the most recently updated active job so
 * the chat can render a single progress indicator without juggling jobIds.
 *
 * Distinct from `useExtractionProgress` (archive batch flow, `extraction:*`
 * namespace).
 */
export function useChatExtractionProgress(): ChatExtractionProgressEntry | null {
  const socket = useContext(SocketContext);
  const [byJob, setByJob] = useState<Map<string, ChatExtractionProgressEntry>>(new Map());

  useEffect(() => {
    if (!socket) return;

    const handleProgress = (payload: ProgressPayload) => {
      setByJob((prev) => {
        const next = new Map(prev);
        next.set(payload.jobId, {
          jobId: payload.jobId,
          progress: payload.progress,
          step: payload.step,
          updatedAt: payload.timestamp,
        });
        return next;
      });
    };

    const clearJob = (payload: CompletionPayload) => {
      setByJob((prev) => {
        if (!prev.has(payload.jobId)) return prev;
        const next = new Map(prev);
        next.delete(payload.jobId);
        return next;
      });
    };

    socket.on('agent:extraction_progress', handleProgress);
    socket.on('agent:extraction_complete', clearJob);
    socket.on('agent:extraction_failed', clearJob);

    return () => {
      socket.off('agent:extraction_progress', handleProgress);
      socket.off('agent:extraction_complete', clearJob);
      socket.off('agent:extraction_failed', clearJob);
    };
  }, [socket]);

  if (byJob.size === 0) return null;
  let latest: ChatExtractionProgressEntry | null = null;
  for (const entry of byJob.values()) {
    if (!latest || entry.updatedAt > latest.updatedAt) latest = entry;
  }
  return latest;
}
