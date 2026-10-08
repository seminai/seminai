import { useQuery } from '@tanstack/react-query';
import { farmRequest, type FarmOperation } from '@/services/farm-api';
import { OperationReview } from './operation-review';
import { Button } from '@/components/ui/button';

interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  version: number;
  createdAt: string;
  detail: { negativeReason?: string };
}
const ACTIONS: Record<string, string> = {
  proposed: 'Proposta creata',
  revised: 'Proposta modificata',
  balance_changed: 'Giacenza cambiata: nuova revisione',
  approved: 'Registrata',
  rejected: 'Rifiutata',
};

export function OperationHistory({
  operation,
  companyId,
}: {
  operation: FarmOperation;
  companyId: string;
}) {
  const audit = useQuery({
    queryKey: ['farm', companyId, 'audit', operation.id, operation.version, operation.status],
    queryFn: () => farmRequest<AuditEntry[]>(`/farm/operations/${operation.id}/audit`),
  });
  return (
    <div className="space-y-2">
      <OperationReview operation={operation} companyId={companyId} />
      <details className="rounded-lg border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Storico delle revisioni</summary>
        {audit.isLoading && <p role="status">Caricamento…</p>}
        {audit.error && (
          <p role="alert">
            {audit.error.message}{' '}
            <Button variant="outline" onClick={() => void audit.refetch()}>
              Riprova
            </Button>
          </p>
        )}
        <ol className="mt-3 space-y-3">
          {audit.data?.map((entry) => (
            <li key={entry.id}>
              <p>
                {ACTIONS[entry.action] || entry.action} · versione {entry.version} ·{' '}
                {new Date(entry.createdAt).toLocaleString('it-IT')}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                Autore / revisore: {entry.actorId}
              </p>
              {entry.detail.negativeReason && (
                <p>Motivo del saldo negativo: {entry.detail.negativeReason}</p>
              )}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
