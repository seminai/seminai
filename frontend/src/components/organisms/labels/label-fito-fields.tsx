import { LabelFieldRow } from '@/components/molecules/labels/label-field-row';
import type { LabelInner, LabelDoseDetail, LabelResistance } from '@/types/label';

function joinList(values?: readonly string[] | null): string {
  return (values ?? []).join(', ');
}

interface LabelFitoFieldsProps {
  readonly label: LabelInner;
}

/** Renders the fitosanitario label variant: scalar fields, detailed dosages and resistances. */
export function LabelFitoFields({ label }: LabelFitoFieldsProps) {
  const dosaggi = label.dosaggi_dettagliati ?? [];
  const resistenze = label.resistenze ?? [];
  return (
    <div className="space-y-6">
      <section>
        <div className="rounded-md border px-3">
          <LabelFieldRow label="Prodotto" value={label.prodotto} />
          <LabelFieldRow label="Categoria" value={label.categoria} />
          <LabelFieldRow label="Formulazione" value={label.formulazione} />
          <LabelFieldRow label="Principio attivo" value={label.principio_attivo} />
          <LabelFieldRow label="Composizione" value={label.composizione} />
          <LabelFieldRow label="Meccanismo azione (FRAC)" value={label.meccanismo_azione_frac} />
          <LabelFieldRow label="Malattie" value={joinList(label.malattie)} />
          <LabelFieldRow label="Specie" value={joinList(label.specie)} />
          <LabelFieldRow label="Colture target" value={joinList(label.colture_target)} />
          <LabelFieldRow label="N. registrazione" value={label.numero_registrazione} />
          <LabelFieldRow label="Titolare" value={label.titolare} />
          <LabelFieldRow label="Stabilimento" value={label.stabilimento} />
          <LabelFieldRow label="Caratteristiche" value={label.caratteristiche} />
          <LabelFieldRow label="Avvertenze" value={joinList(label.avvertenze)} />
          <LabelFieldRow label="Frasi pericolo" value={joinList(label.frasi_pericolo)} />
          <LabelFieldRow label="Frasi prudenza" value={joinList(label.frasi_prudenza)} />
          <LabelFieldRow label="Compatibilità" value={label.compatibilita} />
          <LabelFieldRow label="Note tecniche" value={label.note_tecniche} />
          <LabelFieldRow label="Fitotossicità" value={label.fitotossicita} />
          <LabelFieldRow
            label="Fasce di rispetto e deriva"
            value={joinList(label.fasce_di_rispetto_e_deriva)}
          />
        </div>
      </section>

      {dosaggi.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Dosaggi</h3>
          {dosaggi.map((dose, index) => (
            <DosageCard key={`${dose.coltura ?? 'dose'}-${index}`} dose={dose} />
          ))}
        </section>
      )}

      {resistenze.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Resistenze</h3>
          {resistenze.map((resistance, index) => (
            <ResistanceCard key={index} resistance={resistance} />
          ))}
        </section>
      )}
    </div>
  );
}

function DosageCard({ dose }: { readonly dose: LabelDoseDetail }) {
  const doseRange = [dose.dose_minima, dose.dose_massima]
    .filter((value) => value !== null && value !== undefined)
    .join(' - ');
  return (
    <div className="rounded-md border px-3">
      <LabelFieldRow label="Coltura" value={dose.coltura} />
      <LabelFieldRow label="Malattia" value={dose.malattia} />
      <LabelFieldRow label="Dose" value={doseRange ? `${doseRange} ${dose.dose_um ?? ''}`.trim() : null} />
      <LabelFieldRow label="Acqua max" value={dose.acqua_max ? `${dose.acqua_max} ${dose.acqua_max_um ?? ''}`.trim() : null} />
      <LabelFieldRow label="N. applicazioni" value={dose.n_max_applicazioni} />
      <LabelFieldRow label="Intervallo min (giorni)" value={dose.intervallo_min_giorni} />
      <LabelFieldRow label="Intervallo sicurezza (giorni)" value={dose.intervallo_sicurezza_giorni} />
      <LabelFieldRow label="Epoca impiego" value={dose.epoca_impiego} />
      <LabelFieldRow label="Modalità applicazione" value={dose.modalita_applicazione} />
      <LabelFieldRow label="Istruzioni" value={dose.istruzioni} />
    </div>
  );
}

function ResistanceCard({ resistance }: { readonly resistance: LabelResistance }) {
  return (
    <div className="rounded-md border px-3">
      <LabelFieldRow label="Testo" value={resistance.testo_completo} />
      <LabelFieldRow label="Raccomandazioni" value={resistance.raccomandazioni} />
      <LabelFieldRow label="N. max applicazioni" value={resistance.n_max_applicazioni} />
      <LabelFieldRow label="N. min applicazioni" value={resistance.n_min_applicazioni} />
    </div>
  );
}
