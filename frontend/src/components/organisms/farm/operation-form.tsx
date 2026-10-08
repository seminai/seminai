import { MovementFields } from './movement-fields';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCompleteFarmCatalog, useProposeOperation, useReviseOperation } from '@/hooks/use-farm';
import type {
  FarmOperation,
  FarmRecord,
  OperationInput,
  Product,
  Movement,
} from '@/services/farm-api';
import { JobCategory } from '@/generated/prisma/enums';
import { jobCategoryIt } from '@/components/organisms/jobs/job-detail-italian-labels';

interface Props {
  companyId: string;
  mode: 'IN' | 'OUT' | 'JOB';
  existing?: FarmOperation;
  onDone: () => void;
}
const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
export function OperationForm({ companyId, mode, existing, onDone }: Props) {
  const initial = existing?.payload;
  const [requestKey] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState(
    initial?.date.slice(0, 10) ?? new Date().toLocaleDateString('en-CA'),
  );
  const [reason, setReason] = useState(initial?.reason ?? '');
  const [movements, setMovements] = useState<Movement[]>(
    initial?.movements ??
      (mode === 'JOB' ? [] : [{ productId: '', type: mode, quantity: 0, unit: 'kg', price: 0 }]),
  );
  const [productionUnitId, setProductionUnitId] = useState(initial?.job?.productionUnitId ?? '');
  const [category, setCategory] = useState(initial?.job?.category ?? Object.values(JobCategory)[0]);
  const [surface, setSurface] = useState(String(initial?.job?.quantity ?? ''));
  const products = useCompleteFarmCatalog<Product>(companyId, 'products');
  const units = useCompleteFarmCatalog<FarmRecord>(companyId, 'production-units');
  const create = useProposeOperation(companyId);
  const revise = useReviseOperation(companyId);
  const pending = create.isPending || revise.isPending;
  const error = create.error || revise.error;
  const isJob = mode === 'JOB';
  const title = isJob
    ? 'Registra attività'
    : mode === 'IN'
      ? 'Carico di magazzino'
      : 'Scarico di magazzino';
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const operation: OperationInput = {
      companyId,
      date,
      reason,
      movements,
      job: isJob
        ? {
            productionUnitId,
            category,
            quantity: Number(surface),
            unit: initial?.job?.unit ?? 'ha',
            note: initial?.job?.note,
          }
        : undefined,
    };
    if (existing)
      revise.mutate(
        { id: existing.id, version: existing.version, operation },
        { onSuccess: onDone },
      );
    else create.mutate({ operation, idempotencyKey: requestKey }, { onSuccess: onDone });
  }
  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-5 sm:p-7">
      <div>
        <h2 className="text-xl font-semibold">{existing ? 'Modifica proposta' : title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controlla il riepilogo prima della registrazione.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <Label>Data operazione</Label>
          <Input
            aria-label="Data operazione"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="space-y-2">
          <Label>Causale</Label>
          <Input
            aria-label="Causale"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Es. acquisto, trattamento, raccolta"
          />
        </label>
        {isJob && (
          <>
            <label className="space-y-2">
              <Label>Unità produttiva</Label>
              <select
                aria-label="Unità produttiva"
                className={selectClass}
                required
                value={productionUnitId}
                onChange={(event) => setProductionUnitId(event.target.value)}
              >
                <option value="">Seleziona</option>
                {units.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <Label>Attività</Label>
              <select
                aria-label="Attività"
                className={selectClass}
                value={category}
                onChange={(event) => setCategory(event.target.value as JobCategory)}
              >
                {Object.values(JobCategory).map((value) => (
                  <option key={value} value={value}>
                    {jobCategoryIt(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <Label>Superficie (ha)</Label>
              <Input
                aria-label="Superficie"
                required
                type="number"
                min="0.000001"
                step="any"
                value={surface}
                onChange={(event) => setSurface(event.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <MovementFields
        rows={movements}
        onChange={setMovements}
        products={products.data ?? []}
        defaultType={mode === 'IN' ? 'IN' : 'OUT'}
      />
      {products.isLoading && <p role="status">Caricamento prodotti…</p>}
      {(products.isError || units.isError) && (
        <p role="alert">
          Impossibile caricare i dati.{' '}
          <button
            type="button"
            onClick={() => {
              void products.refetch();
              void units.refetch();
            }}
          >
            Riprova
          </button>
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onDone}>
          Annulla
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvataggio…' : 'Controlla riepilogo'}
        </Button>
      </div>
    </form>
  );
}
