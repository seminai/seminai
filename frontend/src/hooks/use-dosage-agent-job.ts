import { useContext, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  startDosageAgentJob,
  getDosageAgentJobStatus,
  listDosageAgentJobs,
} from '@/services/dosage-agent-api';
import type {
  DosageAgentJobListItem,
  DosageJobStatusResponse,
  DosageLogEvent,
  StartDosageJobRequest,
} from '@/types/planning';
import { SocketContext } from '@/lib/socket-store';

const FALLBACK_POLL_INTERVAL_MS = 60_000;
const ACTIVE_JOBS_POLL_INTERVAL_MS = 5_000;
const DOSAGE_AGENT_JOBS_QUERY_KEY = ['dosage-agent', 'jobs'] as const;
const ACTIVE_JOB_STATES = new Set(['queued', 'waiting', 'active', 'delayed', 'stalled']);

export function useDosageAgentStartJob() {
  return useMutation({
    mutationFn: (input: StartDosageJobRequest) => startDosageAgentJob(input),
  });
}

export function useDosageAgentJobs(options?: { readonly enabled?: boolean }) {
  const socket = useContext(SocketContext);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DOSAGE_AGENT_JOBS_QUERY_KEY,
    queryFn: listDosageAgentJobs,
    enabled: options?.enabled ?? true,
    refetchInterval: (q) => {
      const jobs = q.state.data?.data ?? [];
      const hasActiveJobs = jobs.some((job: DosageAgentJobListItem) =>
        ACTIVE_JOB_STATES.has(job.state),
      );
      return hasActiveJobs ? ACTIVE_JOBS_POLL_INTERVAL_MS : FALLBACK_POLL_INTERVAL_MS;
    },
  });

  const activeJobIds = useMemo(
    () =>
      (query.data?.data ?? [])
        .filter((job) => ACTIVE_JOB_STATES.has(job.state))
        .map((job) => job.id),
    [query.data?.data],
  );
  const activeJobIdsKey = activeJobIds.join(',');

  useEffect(() => {
    if (!socket || activeJobIds.length === 0) return;

    activeJobIds.forEach((id) => socket.emit('join:job', id));
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: DOSAGE_AGENT_JOBS_QUERY_KEY });

    socket.on('dosage:log', invalidate);
    socket.on('job:completing', invalidate);
    socket.on('job:completed', invalidate);

    return () => {
      activeJobIds.forEach((id) => socket.emit('leave:job', id));
      socket.off('dosage:log', invalidate);
      socket.off('job:completing', invalidate);
      socket.off('job:completed', invalidate);
    };
  }, [socket, activeJobIdsKey, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

export function useDosageAgentJobStatus(
  jobId: string | null,
  options?: { readonly enabled?: boolean },
) {
  const socket = useContext(SocketContext);
  const queryClient = useQueryClient();
  const joinedRef = useRef<string | null>(null);

  const queryKey = useMemo(() => ['dosage-agent', 'job-status', jobId] as const, [jobId]);

  const query = useQuery({
    queryKey,
    queryFn: () => getDosageAgentJobStatus(jobId!),
    enabled: Boolean(jobId) && (options?.enabled ?? true),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (data?.data?.stopPolling) return false;
      // Fallback polling at 60s (socket handles real-time updates)
      return FALLBACK_POLL_INTERVAL_MS;
    },
  });

  useEffect(() => {
    if (!socket || !jobId) return;

    if (joinedRef.current !== jobId) {
      socket.emit('join:job', jobId);
      joinedRef.current = jobId;
    }

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey });
    };

    const handleProgress = (evt: DosageLogEvent) => {
      if (evt.jobId !== jobId) return;
      if (evt.type === 'progress') {
        const progress = evt.metadata?.progress;
        if (typeof progress === 'number') {
          queryClient.setQueryData<DosageJobStatusResponse>(queryKey, (prev) =>
            prev ? { ...prev, data: { ...prev.data, progress } } : prev,
          );
          return;
        }
      }
      invalidate();
    };

    const handleCompleted = () => {
      queryClient.setQueryData<DosageJobStatusResponse>(queryKey, (prev) =>
        prev
          ? {
              ...prev,
              data: { ...prev.data, progress: 100, state: 'completed', stopPolling: true },
            }
          : prev,
      );
    };

    socket.on('dosage:log', handleProgress);
    socket.on('job:completing', invalidate);
    socket.on('job:completed', handleCompleted);

    return () => {
      socket.off('dosage:log', handleProgress);
      socket.off('job:completing', invalidate);
      socket.off('job:completed', handleCompleted);
      if (joinedRef.current === jobId) {
        socket.emit('leave:job', jobId);
        joinedRef.current = null;
      }
    };
  }, [socket, jobId, queryClient, queryKey]);

  return query;
}
