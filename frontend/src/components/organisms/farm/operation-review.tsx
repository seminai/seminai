import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReviewOperation, useFarmCatalog } from '@/hooks/use-farm';
import type { FarmOperation, FarmRecord } from '@/services/farm-api';
import { OperationForm } from './operation-form';
export function OperationReview({
  operation,
  companyId,
}: {
  operation: FarmOperation;
  companyId: string;
}) {
  const [negativeReason, setNegativeReason] = useState('');
  const [editing, setEditing] = useState(false);
  const units = useFarmCatalog<FarmRecord>(companyId, 'production-units');
  const review = useReviewOperation(companyId);
  if (editing)
    return (
      <OperationForm
        companyId={companyId}
        existing={operation}
        mode={operation.payload.job ? 'JOB' : operation.payload.movements[0]?.type || 'IN'}
        onDone={() => setEditing(false)}
      />
    );
  const pending = operation.status === 'pending';
  return (
    <article className="space-y-4 rounded-xl border bg-card p-5">
      <header className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-semibold">{operation.payload.reason}</h3>
          <p className="text-sm text-muted-foreground">
            {new Date(operation.payload.date).toLocaleDateString('it-IT')} · Inserita il{' '}
            {new Date(operation.createdAt).toLocaleString('it-IT')} ·{' '}
            {operation.connectionId ? 'Assistente esterno' : 'Inserimento manuale'}
          </p>
        </div>
        <span className="text-sm">
          {pending ? 'Da confermare' : operation.status === 'approved' ? 'Registrata' : 'Rifiutata'}
        </span>
      </header>
      {operation.payload.job && (
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p>
            {operation.payload.job.category} ·{' '}
            {units.data?.find((unit) => unit.id === operation.payload.job?.productionUnitId)
              ?.name || operation.payload.job.productionUnitId}
          </p>
          <p>
            {operation.payload.job.quantity} {operation.payload.job.unit}
          </p>
          {operation.payload.job.note && <p>{operation.payload.job.note}</p>}
        </div>
      )}
      <ul className="space-y-1 text-sm">
        {operation.payload.movements.map((movement, index) => (
          <li key={index}>
            {movement.type === 'IN' ? 'Carico' : 'Scarico'} ·{' '}
            {operation.preview.balances.find((row) => row.productId === movement.productId)?.name} ·{' '}
            {movement.quantity} {movement.unit}
            {movement.documentReference && ` · ${movement.documentReference}`}
          </li>
        ))}
      </ul>
      {operation.preview.balances.map((row) => (
        <div
          key={row.productId}
          className="flex flex-wrap justify-between gap-2 border-t pt-3 text-sm"
        >
          <span>
            {row.name} · {row.warehouse}
          </span>
          <strong>
            {row.before.toLocaleString('it-IT')} → {row.after.toLocaleString('it-IT')} {row.unit}
          </strong>
        </div>
      ))}
      {pending && operation.preview.negativeStock && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
          <p className="text-sm">
            La giacenza diventerà negativa. Indica il motivo per confermare.
          </p>
          <Input
            aria-label="Motivazione giacenza negativa"
            placeholder="Es. carico precedente da registrare"
            value={negativeReason}
            onChange={(event) => setNegativeReason(event.target.value)}
          />
        </div>
      )}
      {review.error && (
        <p role="alert" className="text-sm text-destructive">
          {review.error.message}
        </p>
      )}
      {pending && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(true)} disabled={review.isPending}>
            Modifica
          </Button>
          <Button
            variant="outline"
            disabled={review.isPending}
            onClick={() =>
              review.mutate({ id: operation.id, version: operation.version, decision: 'reject' })
            }
          >
            Rifiuta
          </Button>
          <Button
            disabled={
              review.isPending || (operation.preview.negativeStock && !negativeReason.trim())
            }
            onClick={() =>
              review.mutate({
                id: operation.id,
                version: operation.version,
                decision: 'approve',
                negativeReason,
              })
            }
          >
            {review.isPending ? 'Registrazione…' : 'Conferma registrazione'}
          </Button>
        </div>
      )}
    </article>
  );
}
