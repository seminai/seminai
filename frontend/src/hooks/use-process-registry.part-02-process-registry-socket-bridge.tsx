import {
  useContext,
  useEffect,
} from 'react';
import { SocketContext } from '@/lib/socket-store';
import type { DosageLogEvent } from '@/types/planning';
import type {
  ConformityJobCompletedEvent,
} from '@/types/conformity-checker';
import type {
  ConformityProcessPayload,
  ProcessStatus,
  SocketCompletingEvent,
  SocketErrorEvent,
  SocketLike,
} from './use-process-registry.part-01-conformity-process-payload';
import {
  ProcessRegistryStore,
  formatCompletionMessage,
  getFinalStatus,
  pushStep,
} from './use-process-registry.part-01-conformity-process-payload';

export function ProcessRegistrySocketBridge({
  store,
}: {
  readonly store: ProcessRegistryStore;
}) {
  const socket = useContext(SocketContext) as SocketLike | null;

  useEffect(() => {
    if (!socket) return;

    const handleLog = (event: DosageLogEvent) => {
      const target = store.findByExternalJobId(event.jobId);
      if (!target) return;
      const progress = event.metadata?.progress;
      const suffix = typeof progress === 'number' ? ` (${progress}%)` : '';
      const status: ProcessStatus =
        event.type === 'error' ? 'error' : 'streaming';
      store.update(target.key, (current) => ({
        status,
        message: `${event.message}${suffix}`,
        liveSteps: pushStep(
          current,
          'task_progress',
          `${event.message}${suffix}`,
        ),
      }));
    };

    const handleCompleting = (event: SocketCompletingEvent) => {
      const target = store.findByExternalJobId(event.jobId);
      if (!target) return;
      const message = event.message ?? 'Finalizzazione in corso...';
      store.update(target.key, (current) => ({
        status: 'streaming',
        message,
        liveSteps: pushStep(current, 'system', message),
      }));
    };

    const handleCompleted = (event: ConformityJobCompletedEvent) => {
      const target = store.findByExternalJobId(event.jobId);
      if (!target) return;
      const status = getFinalStatus(event);
      const message =
        event.failedReason ?? formatCompletionMessage(event.result, event.message);
      const proposals = event.result?.proposals ?? [];
      const payload: ConformityProcessPayload = {
        proposals: status === 'completed' ? proposals : [],
      };
      store.update(target.key, (current) => ({
        status,
        message,
        liveSteps: pushStep(current, 'system', message),
        payload,
      }));
      try {
        socket.emit('leave:job', event.jobId);
      } catch {
        // socket may have disconnected; safe to ignore.
      }
    };

    const handleSocketError = (event: SocketErrorEvent) => {
      const message =
        event.message ?? 'Errore durante lo stream del processo.';
      if (event.jobId) {
        const target = store.findByExternalJobId(event.jobId);
        if (target) {
          store.update(target.key, (current) => ({
            status: 'error',
            message,
            liveSteps: pushStep(current, 'system', message),
          }));
          return;
        }
      }
      // Fallback: mark every streaming process as errored when we can't
      // associate the error to a specific job id.
      const snapshot = store.getState();
      for (const value of Object.values(snapshot)) {
        if (value.status === 'streaming' || value.status === 'starting') {
          store.update(value.key, (current) => ({
            status: 'error',
            message,
            liveSteps: pushStep(current, 'system', message),
          }));
        }
      }
    };

    socket.on('dosage:log', handleLog as (...args: unknown[]) => void);
    socket.on('job:completing', handleCompleting as (...args: unknown[]) => void);
    socket.on('job:completed', handleCompleted as (...args: unknown[]) => void);
    socket.on('error', handleSocketError as (...args: unknown[]) => void);

    return () => {
      socket.off('dosage:log', handleLog as (...args: unknown[]) => void);
      socket.off(
        'job:completing',
        handleCompleting as (...args: unknown[]) => void,
      );
      socket.off(
        'job:completed',
        handleCompleted as (...args: unknown[]) => void,
      );
      socket.off('error', handleSocketError as (...args: unknown[]) => void);
    };
  }, [socket, store]);

  return null;
}
