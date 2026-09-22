import { AlertTriangle, Building2, Hash, Package } from 'lucide-react';
import { JobDetailToggleSection } from './job-detail-toggle-section';
import { KeyRow, KeyRowAlways } from './job-detail-key-row';
import { toText } from './job-detail-text';
import { AlertField } from './alert-notes-utils';
import type { AlertNotes } from './alert-notes-helpers';
import { SECTION_KEYS } from './alert-notes-keys';
import { formatDateForView } from './mappers';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function CompanyUnitFieldsSection({
  job,
  company,
  productionUnit,
  fields,
}: {
  readonly job: Record<string, unknown>;
  readonly company: Record<string, unknown> | null;
  readonly productionUnit: Record<string, unknown> | null;
  readonly fields: readonly unknown[];
}) {
  return (
    <JobDetailToggleSection title="Azienda, unità e campi" icon={Building2}>
      <KeyRowAlways label="Ragione sociale" value={toText(company?.name) || '—'} />
      <KeyRow label="ID azienda" value={toText(company?.id)} mono />
      <KeyRowAlways label="Unità produttiva" value={toText(productionUnit?.name) || '—'} />
      <KeyRow label="Coltura" value={toText(productionUnit?.cropName)} />
      <KeyRow label="Tipo coltura" value={toText(productionUnit?.cropType)} />
      <KeyRow label="SAU (ettari)" value={toText(productionUnit?.sauHa)} />
      <KeyRowAlways label="ID unità produttiva" value={toText(job.productionUnitId)} mono />
      {fields.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Nessun campo associato.</p>
      ) : (
        <ul className="list-inside list-decimal space-y-1.5 py-2 text-sm">
          {fields.map((item, index) => {
            const f = asRecord(item);
            const rawId = typeof f?.id === 'string' ? f.id : '';
            return (
              <li key={rawId || `field-${index}`} className="wrap-break-word">
                <span className="font-medium">{toText(f?.name)}</span>
                <span className="ml-1 font-mono text-xs text-muted-foreground">({toText(f?.id)})</span>
              </li>
            );
          })}
        </ul>
      )}
    </JobDetailToggleSection>
  );
}

export function ProductsSection({ products }: { readonly products: readonly unknown[] }) {
  return (
    <JobDetailToggleSection title="Prodotti" icon={Package}>
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun prodotto associato.</p>
      ) : (
        <ul className="list-inside list-decimal space-y-2 text-sm">
          {products.map((item, index) => {
            const p = asRecord(item);
            const rawId = typeof p?.id === 'string' ? p.id : '';
            return (
              <li key={rawId || `product-${index}`} className="rounded border bg-background/80 px-2 py-1.5">
                <span className="font-medium">{toText(p?.name)}</span>
                {p?.registrationNumber != null && String(p.registrationNumber).length > 0 ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Numero registrazione: {toText(p.registrationNumber)}
                  </span>
                ) : null}
                <span className="mt-0.5 block font-mono text-[0.65rem] text-muted-foreground">
                  ID: {toText(p?.id)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </JobDetailToggleSection>
  );
}

export function ContextSection({
  job,
  raw,
  historyCount,
}: {
  readonly job: Record<string, unknown>;
  readonly raw: Record<string, unknown>;
  readonly historyCount: number;
}) {
  return (
    <JobDetailToggleSection title="Identificativi e contesto" icon={Hash}>
      <KeyRowAlways label="ID operazione" value={toText(job.id)} mono />
      <KeyRow label="ID ciclo produttivo" value={toText(job.productionCycleId)} mono />
      <KeyRow label="Creata il" value={formatDateForView(toText(job.createdAt))} />
      <KeyRow label="Ultimo aggiornamento" value={formatDateForView(toText(job.updatedAt))} />
      <KeyRow label="Nome batch agente dosaggi" value={toText(raw.dosageAgentJobName)} />
      <p className="pt-2 text-xs text-muted-foreground">
        Cronologia eventi: <strong className="text-foreground">{historyCount}</strong> — apri la scheda{' '}
        <strong>Storico</strong> per il dettaglio completo.
      </p>
    </JobDetailToggleSection>
  );
}

export function FrasiPericoloSection({ alertNotes }: { readonly alertNotes: AlertNotes }) {
  return (
    <JobDetailToggleSection title="Frasi di Pericolo" icon={AlertTriangle} tone="red">
      {SECTION_KEYS.pericolo.map((k) => <AlertField key={k} notes={alertNotes} fieldKey={k} />)}
    </JobDetailToggleSection>
  );
}

export function LeftoverAlertsSection({
  alertNotes,
  keys,
}: {
  readonly alertNotes: AlertNotes;
  readonly keys: readonly string[];
}) {
  return (
    <JobDetailToggleSection title="Altri avvisi tecnici" icon={AlertTriangle}>
      {keys.map((k) => <AlertField key={k} notes={alertNotes} fieldKey={k} />)}
    </JobDetailToggleSection>
  );
}
