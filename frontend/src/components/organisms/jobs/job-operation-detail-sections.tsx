import { Bug, Droplets, Hexagon, Leaf, Shield, Warehouse } from 'lucide-react';
import { boolIta, jobCategoryIt } from './job-detail-italian-labels';
import { JobDetailToggleSection } from './job-detail-toggle-section';
import { KeyRow, KeyRowAlways } from './job-detail-key-row';
import { toText } from './job-detail-text';
import {
  hasAny,
  readScalar,
  readWithUnit,
  type AlertNotes,
} from './alert-notes-helpers';
import { AlertField } from './alert-notes-utils';
import { SECTION_KEYS } from './alert-notes-keys';

interface SectionProps {
  readonly job: Record<string, unknown>;
  readonly alertNotes: AlertNotes | null;
}

export function DoseSection({ job, alertNotes }: SectionProps) {
  const qtyLine = `${toText(job.quantity)} ${toText(job.unitOfMeasureQuantity)}`.trim();
  const perHaLine = `${toText(job.productQuantityTreated)} ${toText(job.unitOfMeasureProductQuantityTreated)}`.trim();
  const doseMin = readWithUnit(alertNotes, 'dose_minima', 'dose_um');
  const doseMax = readWithUnit(alertNotes, 'dose_massima', 'dose_um');
  const doseMinHl = readScalar(alertNotes, 'dose_minima_hl_job');
  const doseMaxHl = readScalar(alertNotes, 'dose_massima_hl_job');
  const acquaMax = readWithUnit(alertNotes, 'acqua_max', 'acqua_max_um');
  const acquaJob = readWithUnit(alertNotes, 'acquaMaxJob', 'acquaMaxJob_um');
  const waterHl = readScalar(alertNotes, 'waterHlJob');
  const nMaxApp = readWithUnit(alertNotes, 'n_max_applicazioni', 'n_max_applicazioni_um');

  return (
    <JobDetailToggleSection title="Dose" icon={Droplets} defaultOpen>
      <KeyRowAlways label="Quantità operazione" value={qtyLine || '—'} />
      <KeyRow label="Quantità prodotto distribuito" value={perHaLine || '—'} />
      <KeyRow label="Superficie trattata" value={toText(job.treatedSurface)} />
      <KeyRow label="Acqua distribuita (litri)" value={toText(job.totalDistributedWaterL)} />
      {doseMin ? <KeyRowAlways label="Dose minima etichetta" value={doseMin} /> : null}
      {doseMax ? <KeyRowAlways label="Dose massima etichetta" value={doseMax} /> : null}
      {doseMinHl ? <KeyRowAlways label="Dose minima per ettolitro" value={doseMinHl} /> : null}
      {doseMaxHl ? <KeyRowAlways label="Dose massima per ettolitro" value={doseMaxHl} /> : null}
      {acquaMax ? <KeyRowAlways label="Acqua massima ammessa" value={acquaMax} /> : null}
      {acquaJob ? <KeyRowAlways label="Acqua massima del job" value={acquaJob} /> : null}
      {waterHl ? <KeyRowAlways label="Acqua per ettolitro (job)" value={waterHl} /> : null}
      {nMaxApp ? <KeyRowAlways label="Numero massimo applicazioni" value={nMaxApp} /> : null}
    </JobDetailToggleSection>
  );
}

export function ModalitaSection({
  job,
  alertNotes,
  machine,
}: SectionProps & { readonly machine: Record<string, unknown> | null }) {
  return (
    <JobDetailToggleSection title="Modalità" icon={Leaf}>
      <KeyRow label="Modalità di applicazione (operazione)" value={toText(job.modeOfApplication)} />
      <KeyRowAlways label="Trattamento localizzato" value={boolIta(job.isLocalizedTreatment)} />
      <KeyRowAlways
        label="Macchina assegnata"
        value={machine?.name ? toText(machine.name) : 'Nessuna macchina assegnata'}
      />
      <KeyRow label="ID macchina" value={toText(job.machineId ?? machine?.id)} mono />
      {alertNotes
        ? SECTION_KEYS.modalita.map((k) => <AlertField key={k} notes={alertNotes} fieldKey={k} />)
        : null}
    </JobDetailToggleSection>
  );
}

export function MagazzinoSection({
  alertNotes,
  stockMention,
  showAlertDot,
}: {
  readonly alertNotes: AlertNotes | null;
  readonly stockMention: boolean;
  readonly showAlertDot: boolean;
}) {
  const stockOut = readWithUnit(alertNotes, 'stock_out', 'stock_out_um');
  const stockIn = readWithUnit(alertNotes, 'stock_in_warehouse', 'stock_in_warehouse_um');
  const stockReq = readWithUnit(alertNotes, 'total_stock_required_for_jobs', 'total_stock_required_for_jobs_um');
  const excludedProduct = readScalar(alertNotes, 'excluded_product');
  const exclusionReason = readScalar(alertNotes, 'exclusion_reason');

  return (
    <JobDetailToggleSection title="Magazzino" icon={Warehouse} showAlertDot={showAlertDot}>
      {!alertNotes && !stockMention ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Nessun dato di giacenza disponibile per questa operazione.
        </p>
      ) : null}
      {stockIn ? <KeyRowAlways label="Giacenza in magazzino" value={stockIn} /> : null}
      {stockOut ? <KeyRowAlways label="Stock prelevato" value={stockOut} /> : null}
      {stockReq ? <KeyRowAlways label="Stock totale richiesto" value={stockReq} /> : null}
      {alertNotes ? <AlertField notes={alertNotes} fieldKey="ddt_date_is_ok" /> : null}
      {alertNotes ? <AlertField notes={alertNotes} fieldKey="ddt_date_conformity" /> : null}
      {alertNotes ? <AlertField notes={alertNotes} fieldKey="ddt_date_after_treatment" /> : null}
      {excludedProduct ? <KeyRowAlways label="Prodotto escluso" value={excludedProduct} /> : null}
      {exclusionReason ? <KeyRowAlways label="Motivo esclusione" value={exclusionReason} /> : null}
      {stockMention && !stockIn && !stockOut && !stockReq ? (
        <KeyRowAlways
          label="Segnalazione nelle note"
          value="Possibile riferimento a stock o magazzino nel testo delle note."
        />
      ) : null}
    </JobDetailToggleSection>
  );
}

export function MalattieSection({ job, alertNotes }: SectionProps) {
  return (
    <JobDetailToggleSection title="Malattie" icon={Bug}>
      <KeyRowAlways label="Avversità / patologie (operazione)" value={toText(job.avversity) || '—'} />
      <KeyRowAlways label="Categoria intervento" value={jobCategoryIt(toText(job.category))} />
      {alertNotes
        ? SECTION_KEYS.malattie.map((k) => <AlertField key={k} notes={alertNotes} fieldKey={k} />)
        : null}
    </JobDetailToggleSection>
  );
}

export function FasceSection({ job, alertNotes }: SectionProps) {
  return (
    <JobDetailToggleSection
      title="Fasce di rispetto e deriva"
      icon={Hexagon}
      showAlertDot={hasAny(alertNotes, SECTION_KEYS.fasce)}
    >
      <KeyRowAlways label="Giustificazione / deriva" value={toText(job.giustification) || '—'} />
      {alertNotes
        ? SECTION_KEYS.fasce.map((k) => <AlertField key={k} notes={alertNotes} fieldKey={k} />)
        : null}
    </JobDetailToggleSection>
  );
}

export function ConformitaSection({
  job,
  alertNotes,
  isVerified,
  conformity,
}: SectionProps & { readonly isVerified: boolean; readonly conformity: boolean }) {
  return (
    <JobDetailToggleSection
      title="Conformità e verifica"
      icon={Shield}
      tone={!isVerified ? 'amber' : 'default'}
      showAlertDot={hasAny(alertNotes, SECTION_KEYS.conformita)}
    >
      <KeyRowAlways label="Operazione verificata" value={boolIta(isVerified)} />
      <KeyRowAlways label="Conformità controllata" value={boolIta(conformity)} />
      <KeyRowAlways label="Categoria" value={jobCategoryIt(toText(job.category))} />
      {alertNotes
        ? SECTION_KEYS.conformita.map((k) => <AlertField key={k} notes={alertNotes} fieldKey={k} />)
        : null}
    </JobDetailToggleSection>
  );
}
