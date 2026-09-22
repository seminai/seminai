import { useCallback, useContext, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SocketContext } from '@/lib/socket-store';
import {
  confirmConformityProposals,
  startConformityCheckJob,
} from '@/services/conformity-checker-api';
import {
  useProcess,
  useProcessRegistry,
  type ConformityProcessPayload,
  type ProcessState,
} from '@/hooks/use-process-registry';
import { buildLiveStep } from '@/components/organisms/jobs/job-conformity-live-steps';
import type { VerificationSnapshot } from '@/components/organisms/jobs/types';
import type { ProcessStatus } from '@/hooks/use-process-registry';
import type { ConformityProposal } from '@/types/conformity-checker';

export const CONFORMITY_PROCESS_PREFIX = 'conformity:' as const;

export function buildConformityProcessKey(jobGroupId: string): string {
  return `${CONFORMITY_PROCESS_PREFIX}${jobGroupId}`;
}

function mapProcessStatusToSnapshotStatus(
  status: ProcessStatus,
): VerificationSnapshot['status'] {
  if (status === 'starting' || status === 'idle') return 'streaming';
  return status;
}

export function processStateToVerificationSnapshot(
  state: ProcessState | null,
): VerificationSnapshot | null {
  if (!state) return null;
  return {
    status: mapProcessStatusToSnapshotStatus(state.status),
    message: state.message,
    threadId: state.externalJobId ?? '',
    updatedAtIso: state.updatedAtIso,
    liveSteps: state.liveSteps,
  };
}

interface UseConformityProcessParams {
  readonly jobGroupId: string | null;
  readonly notes: string;
  readonly onProposalApplied?: () => Promise<void> | void;
}

interface UseConformityProcessResult {
  readonly state: ProcessState | null;
  readonly snapshot: VerificationSnapshot | null;
  readonly activeJobId: string | null;
  readonly isRunning: boolean;
  readonly startError: Error | null;
  readonly start: () => Promise<void>;
  readonly proposals: readonly ConformityProposal[];
  readonly applyingJobId: string | null;
  readonly approveProposal: (jobId: string) => Promise<void>;
  readonly rejectProposal: (jobId: string) => void;
}

function readPayloadProposals(state: ProcessState | null): readonly ConformityProposal[] {
  if (!state || !state.payload) return [];
  const payload = state.payload as ConformityProcessPayload;
  return payload.proposals ?? [];
}

export function useConformityProcess({
  jobGroupId,
  notes,
  onProposalApplied,
}: UseConformityProcessParams): UseConformityProcessResult {
  const registry = useProcessRegistry();
  const socket = useContext(SocketContext);

  const processKey = jobGroupId ? buildConformityProcessKey(jobGroupId) : null;
  const state = useProcess(processKey);

  const [rejectedJobIds, setRejectedJobIds] = useState<readonly string[]>([]);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);

  const startMutation = useMutation({ mutationFn: startConformityCheckJob });
  const { error: startError, isPending: isStartPending, mutateAsync: startJob } =
    startMutation;

  const isRunning = useMemo(() => {
    if (isStartPending) return true;
    if (!state) return false;
    return state.status === 'starting' || state.status === 'streaming';
  }, [isStartPending, state]);

  const allProposals = useMemo(() => readPayloadProposals(state), [state]);
  const proposals = useMemo(
    () => allProposals.filter((proposal) => !rejectedJobIds.includes(proposal.jobId)),
    [allProposals, rejectedJobIds],
  );

  const start = useCallback(async (): Promise<void> => {
    if (!jobGroupId || !processKey) return;
    if (isRunning) return;
    setRejectedJobIds([]);
    registry.register(processKey, {
      kind: 'conformity',
      status: 'starting',
      message: 'Avvio job di controllo conformità...',
      liveSteps: [buildLiveStep('system', 'Avvio job di controllo conformità...')],
      externalJobId: null,
    });
    try {
      const response = await startJob({
        jobGroupId,
        notes: notes.trim(),
      });
      const startedJobId = response.data.jobId;
      registry.update(processKey, (current) => ({
        status: 'streaming',
        message: 'Job di controllo conformità avviato.',
        externalJobId: startedJobId,
        liveSteps: [
          ...current.liveSteps,
          buildLiveStep('system', 'Job di controllo conformità avviato.'),
        ],
      }));
      if (socket) {
        socket.emit('join:job', startedJobId);
      } else {
        registry.update(processKey, (current) => ({
          status: 'error',
          message: 'Connessione realtime non disponibile.',
          liveSteps: [
            ...current.liveSteps,
            buildLiveStep('system', 'Connessione realtime non disponibile.'),
          ],
        }));
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Errore durante l\'avvio del controllo conformità.';
      registry.update(processKey, (current) => ({
        status: 'error',
        message,
        liveSteps: [...current.liveSteps, buildLiveStep('system', message)],
      }));
    }
  }, [isRunning, jobGroupId, notes, processKey, registry, socket, startJob]);

  const approveProposal = useCallback(
    async (jobId: string): Promise<void> => {
      if (!jobGroupId || !processKey) return;
      const target = allProposals.find((proposal) => proposal.jobId === jobId);
      if (!target) return;
      setApplyingJobId(jobId);
      try {
        await confirmConformityProposals({
          jobGroupId,
          jobIds: [jobId],
          proposals: [target],
        });
        setRejectedJobIds((current) => [...current, jobId]);
        registry.update(processKey, (current) => {
          const remaining = readPayloadProposals(current).filter(
            (proposal) => proposal.jobId !== jobId,
          );
          const nextPayload: ConformityProcessPayload = { proposals: remaining };
          return {
            payload: nextPayload,
            liveSteps: [
              ...current.liveSteps,
              buildLiveStep(
                'system',
                `Proposta applicata per ${target.productName || jobId}.`,
              ),
            ],
          };
        });
        if (onProposalApplied) await onProposalApplied();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Errore durante l\'applicazione della proposta.';
        registry.update(processKey, (current) => ({
          liveSteps: [...current.liveSteps, buildLiveStep('system', message)],
        }));
      } finally {
        setApplyingJobId(null);
      }
    },
    [allProposals, jobGroupId, onProposalApplied, processKey, registry],
  );

  const rejectProposal = useCallback(
    (jobId: string): void => {
      if (!processKey) return;
      const target = allProposals.find((proposal) => proposal.jobId === jobId);
      setRejectedJobIds((current) =>
        current.includes(jobId) ? current : [...current, jobId],
      );
      registry.update(processKey, (current) => {
        const remaining = readPayloadProposals(current).filter(
          (proposal) => proposal.jobId !== jobId,
        );
        const nextPayload: ConformityProcessPayload = { proposals: remaining };
        return {
          payload: nextPayload,
          liveSteps: [
            ...current.liveSteps,
            buildLiveStep(
              'system',
              `Proposta rifiutata per ${target?.productName || jobId}.`,
            ),
          ],
        };
      });
    },
    [allProposals, processKey, registry],
  );

  return {
    state,
    snapshot: processStateToVerificationSnapshot(state),
    activeJobId: state?.externalJobId ?? null,
    isRunning,
    startError: (startError as Error | null) ?? null,
    start,
    proposals,
    applyingJobId,
    approveProposal,
    rejectProposal,
  };
}
