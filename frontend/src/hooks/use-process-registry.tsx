import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { SocketContext } from '@/lib/socket-store';
import type { DosageLogEvent } from '@/types/planning';
import type {
  ConformityJobCompletedEvent,
  ConformityProposal,
} from '@/types/conformity-checker';
import {
  appendLiveStep,
  buildLiveStep,
} from '@/components/organisms/jobs/job-conformity-live-steps';
import type { VerificationLiveStep } from '@/components/organisms/jobs/types';

export interface ConformityProcessPayload {
  readonly proposals: readonly ConformityProposal[];
}

export type ProcessKey = string;

export type ProcessKind =
  | 'conformity'
  | 'upload'
  | 'rule_vectorization'
  | 'job_validation'
  | 'generic';

export type ProcessStatus =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'completed'
  | 'error';

export interface ProcessState<TPayload = unknown> {
  readonly key: ProcessKey;
  readonly kind: ProcessKind;
  readonly status: ProcessStatus;
  readonly message: string;
  readonly liveSteps: readonly VerificationLiveStep[];
  readonly externalJobId: string | null;
  readonly updatedAtIso: string;
  readonly payload?: TPayload;
}

type Listener = () => void;

const TERMINAL_TTL_MS = 5 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function isTerminal(status: ProcessStatus): boolean {
  return status === 'completed' || status === 'error';
}

interface SocketLike {
  on: (event: string, handler: (...args: unknown[]) => void) => unknown;
  off: (event: string, handler: (...args: unknown[]) => void) => unknown;
  emit: (event: string, ...args: unknown[]) => unknown;
}

class ProcessRegistryStore {
  private state: Readonly<Record<ProcessKey, ProcessState>> = {};
  private listeners = new Set<Listener>();
  private cleanupTimers = new Map<ProcessKey, ReturnType<typeof setTimeout>>();

  getState = (): Readonly<Record<ProcessKey, ProcessState>> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getProcess = (key: ProcessKey): ProcessState | null => this.state[key] ?? null;

  findByExternalJobId = (jobId: string): ProcessState | null => {
    for (const value of Object.values(this.state)) {
      if (value.externalJobId === jobId) return value;
    }
    return null;
  };

  register = <TPayload,>(
    key: ProcessKey,
    init: Omit<ProcessState<TPayload>, 'key' | 'updatedAtIso'> &
      Partial<Pick<ProcessState<TPayload>, 'updatedAtIso'>>,
  ): void => {
    const next: ProcessState<TPayload> = {
      key,
      updatedAtIso: init.updatedAtIso ?? nowIso(),
      ...init,
    };
    this.state = { ...this.state, [key]: next as ProcessState };
    this.scheduleCleanupIfTerminal(key, next.status);
    this.notify();
  };

  update = (
    key: ProcessKey,
    patch:
      | Partial<Omit<ProcessState, 'key'>>
      | ((current: ProcessState) => Partial<Omit<ProcessState, 'key'>>),
  ): void => {
    const current = this.state[key];
    if (!current) return;
    const partial = typeof patch === 'function' ? patch(current) : patch;
    const next: ProcessState = {
      ...current,
      ...partial,
      key,
      updatedAtIso: partial.updatedAtIso ?? nowIso(),
    };
    this.state = { ...this.state, [key]: next };
    this.scheduleCleanupIfTerminal(key, next.status);
    this.notify();
  };

  clear = (key: ProcessKey): void => {
    if (!(key in this.state)) return;
    const { [key]: _removed, ...rest } = this.state;
    void _removed;
    this.state = rest;
    this.cancelCleanupTimer(key);
    this.notify();
  };

  private scheduleCleanupIfTerminal = (
    key: ProcessKey,
    status: ProcessStatus,
  ): void => {
    this.cancelCleanupTimer(key);
    if (!isTerminal(status)) return;
    const timer = setTimeout(() => {
      this.cleanupTimers.delete(key);
      this.clear(key);
    }, TERMINAL_TTL_MS);
    this.cleanupTimers.set(key, timer);
  };

  private cancelCleanupTimer = (key: ProcessKey): void => {
    const timer = this.cleanupTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(key);
    }
  };

  private notify = (): void => {
    for (const listener of this.listeners) listener();
  };
}

interface ProcessRegistryContextValue {
  readonly store: ProcessRegistryStore;
}

const ProcessRegistryContext = createContext<ProcessRegistryContextValue | null>(
  null,
);

export function ProcessRegistryProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [store] = useState<ProcessRegistryStore>(() => new ProcessRegistryStore());

  const value = useMemo<ProcessRegistryContextValue>(() => ({ store }), [store]);

  return (
    <ProcessRegistryContext.Provider value={value}>
      <ProcessRegistrySocketBridge store={store} />
      {children}
    </ProcessRegistryContext.Provider>
  );
}

function useProcessRegistryContext(): ProcessRegistryContextValue {
  const ctx = useContext(ProcessRegistryContext);
  if (!ctx) {
    throw new Error(
      'useProcessRegistry must be used within ProcessRegistryProvider',
    );
  }
  return ctx;
}

export function useProcessRegistry(): ProcessRegistryStore {
  return useProcessRegistryContext().store;
}

export function useProcess(key: ProcessKey | null): ProcessState | null {
  const store = useProcessRegistryContext().store;
  return useSyncExternalStore(
    store.subscribe,
    () => (key ? store.getProcess(key) : null),
    () => null,
  );
}

interface SocketCompletingEvent {
  readonly jobId: string;
  readonly message?: string;
}

interface SocketErrorEvent {
  readonly message?: string;
  readonly jobId?: string;
}

function formatCompletionMessage(
  result: ConformityJobCompletedEvent['result'],
  fallback: string | undefined,
): string {
  const summary = result?.summary;
  if (!summary) return fallback ?? 'Controllo conformità completato.';
  return `Controllo completato: ${summary.conformJobs} conformi, ${summary.nonConformJobs} non conformi su ${summary.totalJobs} interventi.`;
}

function getFinalStatus(event: ConformityJobCompletedEvent): ProcessStatus {
  return event.state === 'failed' || event.failedReason ? 'error' : 'completed';
}

function pushStep(
  current: ProcessState,
  kind: VerificationLiveStep['kind'],
  message: string,
): readonly VerificationLiveStep[] {
  return appendLiveStep(current.liveSteps, buildLiveStep(kind, message));
}

function ProcessRegistrySocketBridge({
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
