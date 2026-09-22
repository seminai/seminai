import { Activity, Bot, ListChecks, Search, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { conformitySnapshotStatusIt } from './job-detail-italian-labels';
import { formatDateForView } from './mappers';
import type { VerificationLiveStep, VerificationSnapshot } from './types';

interface JobVerificationStatusBoxProps {
  readonly snapshot: VerificationSnapshot | null;
  readonly title?: string;
}

function iconForStep(kind: VerificationLiveStep['kind']) {
  if (kind === 'thinking' || kind === 'reasoning') return Bot;
  if (kind === 'task_update' || kind === 'task_progress') return ListChecks;
  if (kind === 'tool_start' || kind === 'tool_result') return Wrench;
  return Activity;
}

function textClassForStatus(status: VerificationSnapshot['status']): string {
  if (status === 'completed') return 'text-emerald-700';
  if (status === 'error') return 'text-red-700';
  if (status === 'requires_approval') return 'text-amber-700';
  return 'text-foreground';
}

function statusBadgeVariant(status: VerificationSnapshot['status']): 'secondary' | 'outline' | 'destructive' {
  if (status === 'completed') return 'secondary';
  if (status === 'error') return 'destructive';
  return 'outline';
}

export function JobVerificationStatusBox({
  snapshot,
  title = 'Ultima verifica conformità',
}: JobVerificationStatusBoxProps) {
  if (!snapshot) return null;
  return (
    <Card size="sm" className="mb-3">
      <CardHeader className="border-b">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Stato</span>
          <Badge variant={statusBadgeVariant(snapshot.status)}>
            {conformitySnapshotStatusIt(snapshot.status)}
          </Badge>
          <span className="text-xs text-muted-foreground">Aggiornato: {formatDateForView(snapshot.updatedAtIso)}</span>
        </div>
        <p className={cn('text-sm', textClassForStatus(snapshot.status))}>{snapshot.message}</p>
        {snapshot.liveSteps.length > 0 ? (
          <div className="rounded-md border bg-muted/20 p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Search className="size-3.5" />
              Avanzamento live
            </div>
            <div className="space-y-1.5">
              {snapshot.liveSteps.map((step) => {
                const Icon = iconForStep(step.kind);
                return (
                  <div key={step.id} className="flex items-start gap-2 text-xs text-foreground">
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 wrap-break-word">{step.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
