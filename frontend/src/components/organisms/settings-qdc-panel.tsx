import { Loader2, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getGetQdcSyncStatusQueryKey,
  useGetQdcSyncStatus,
  usePostQdcSync,
} from '@/generated/api/qdc/qdc';
import {
  getGetSettingsQdcSyncQueryKey,
  useGetSettingsQdcSync,
  usePatchSettingsQdcSync,
} from '@/generated/api/settings/settings';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  describeQdcSyncStatus,
  formatQdcSyncCounters,
  formatQdcSyncDate,
} from '@/lib/qdc-sync-status';

const RUNNING_POLL_MS = 4000;

/**
 * QDC (Quaderno di Campagna) sync panel: nightly-sync opt-in switch,
 * manual "Sincronizza ora" trigger and last-run status/counters.
 */
export function QdcSyncPanel() {
  const queryClient = useQueryClient();
  const toggleQuery = useGetSettingsQdcSync();
  const patchToggle = usePatchSettingsQdcSync();
  const statusQuery = useGetQdcSyncStatus({
    query: {
      refetchInterval: (query) =>
        query.state.data?.data?.data?.run?.status === 'running' ? RUNNING_POLL_MS : false,
    },
  });
  const startSync = usePostQdcSync<ApiError>();
  const enabled = toggleQuery.data?.data?.data?.enabled ?? false;
  const statusData = statusQuery.data?.data?.data;
  const run = statusData?.run ?? null;
  const isRunning = run?.status === 'running';
  const badge = describeQdcSyncStatus(run?.status);
  const countersLine = formatQdcSyncCounters(run?.counters);
  const invalidateStatus = () =>
    queryClient.invalidateQueries({ queryKey: getGetQdcSyncStatusQueryKey() });

  const handleToggle = (next: boolean) => {
    patchToggle.mutate(
      { data: { enabled: next } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getGetSettingsQdcSyncQueryKey() }),
      },
    );
  };

  const handleSyncNow = () => {
    startSync.mutate(undefined, {
      onSuccess: () => {
        toast.success('Sincronizzazione avviata');
        void invalidateStatus();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 409) {
          toast.info('Sincronizzazione già in corso');
          void invalidateStatus();
          return;
        }
        if (error instanceof ApiError && error.status === 400) {
          toast.error('Integrazione QDC non configurata sul server');
          return;
        }
        toast.error('Avvio sincronizzazione non riuscito');
      },
    });
  };

  if (toggleQuery.isLoading || statusQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Caricamento...
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Sincronizzazione automatica notturna</p>
          <p className="text-xs text-muted-foreground">
            Ogni notte i dati del Quaderno di Campagna (aziende, unità colturali, operazioni,
            giacenze, scadenze) vengono copiati in Seminai.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={patchToggle.isPending} />
      </div>

      {patchToggle.isError && (
        <p className="text-xs text-destructive">
          Impossibile aggiornare l&apos;impostazione. Riprova.
        </p>
      )}

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium">Ultima sincronizzazione</p>
          {run ? (
            <span
              className={cn('rounded-full px-2 py-0.5 text-xs font-medium', badge.className)}
            >
              {isRunning ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> {badge.label}
                </span>
              ) : (
                badge.label
              )}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Mai eseguita</span>
          )}
        </div>
        {run && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              {formatQdcSyncDate(run.finishedAt ?? run.startedAt) ?? '—'}
              {run.trigger === 'cron' ? ' · automatica' : ' · manuale'}
            </p>
            {countersLine && <p>{countersLine}</p>}
            {run.status === 'error' && run.error && (
              <p className="text-destructive">{run.error}</p>
            )}
            {statusData?.aziendaCount !== undefined && (
              <p>{statusData.aziendaCount} aziende QDC collegate</p>
            )}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncNow}
          disabled={startSync.isPending || isRunning}
        >
          <RefreshCw className={startSync.isPending || isRunning ? 'animate-spin' : undefined} />
          {startSync.isPending || isRunning ? 'Sincronizzazione…' : 'Sincronizza ora'}
        </Button>
      </div>
    </div>
  );
}
