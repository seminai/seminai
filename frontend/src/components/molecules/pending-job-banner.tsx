import { useEffect, useRef } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useDosageAgentJobStatus } from '@/hooks/use-dosage-agent-job';

interface PendingJobBannerProps {
  readonly jobId: string;
  readonly onCompleted: (jobId: string) => void;
}

export function PendingJobBanner({ jobId, onCompleted }: PendingJobBannerProps) {
  const { data } = useDosageAgentJobStatus(jobId);
  const completedRef = useRef(false);

  const jobState = data?.data?.state ?? 'waiting';
  const progress = data?.data?.progress ?? 0;
  const isDone = jobState === 'completed' || data?.data?.stopPolling === true;

  useEffect(() => {
    if (isDone && !completedRef.current) {
      completedRef.current = true;
      const timer = setTimeout(() => onCompleted(jobId), 1500);
      return () => clearTimeout(timer);
    }
  }, [isDone, jobId, onCompleted]);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      {isDone ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
      ) : (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {isDone ? 'Calcolo dosaggi completato' : 'Calcolo dosaggi in corso...'}
        </p>
        <Progress value={isDone ? 100 : progress} className="mt-1 h-1.5" />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {isDone ? '100' : Math.round(progress)}%
      </span>
    </div>
  );
}
