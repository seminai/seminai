import { LabelFieldRow } from '@/components/molecules/labels/label-field-row';
import type { LabelInner } from '@/types/label';
import type { FertilizerCropDose } from '@/types/fertilizer-label';

function readScalar(record: Record<string, unknown> | null | undefined, key: string): string | number | null {
  const value = record?.[key];
  if (typeof value === 'string' || typeof value === 'number') return value;
  return null;
}

interface LabelFertilizerFieldsProps {
  readonly label: LabelInner;
}

/** Renders the EU fertilizer label variant: identification, composition, doses and safety. */
export function LabelFertilizerFields({ label }: LabelFertilizerFieldsProps) {
  const fertilizer = label.prodotto_fertilizzante_ue;
  if (!fertilizer) return null;
  const identification = fertilizer.identificazione_prodotto ?? {};
  const composition = fertilizer.composizione_garantita ?? {};
  const instructions = fertilizer.istruzioni_uso_agronomiche ?? {};
  const cropDoses = instructions.dosi_applicazione?.specifiche_coltura ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Identificazione prodotto</h3>
        <div className="rounded-md border px-3">
          <LabelFieldRow label="Nome commerciale" value={identification.nome_commerciale} />
          <LabelFieldRow label="Funzione/Categoria" value={identification.funzione_categoria_prodotto} />
          <LabelFieldRow label="Numero lotto" value={identification.numero_lotto} />
          <LabelFieldRow label="Stato fisico" value={identification.stato_fisico} />
          <LabelFieldRow label="Confezioni disponibili" value={identification.confezioni_disponibili} />
          <LabelFieldRow label="Quantità nominale" value={identification.quantita_nominale} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Composizione garantita</h3>
        <div className="rounded-md border px-3">
          <LabelFieldRow label="N totale" value={readScalar(composition, 'N_totale')} />
          <LabelFieldRow label="P2O5 totale" value={readScalar(composition, 'P2O5_totale')} />
          <LabelFieldRow label="K2O totale" value={readScalar(composition, 'K2O_totale')} />
          <LabelFieldRow label="CaO totale" value={readScalar(composition, 'CaO_totale')} />
          <LabelFieldRow label="MgO totale" value={readScalar(composition, 'MgO_totale')} />
          <LabelFieldRow label="SO3 totale" value={readScalar(composition, 'SO3_totale')} />
          <LabelFieldRow
            label="Sostanza organica"
            value={readScalar(composition, 'sostanza_organica')}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Istruzioni d'uso</h3>
        <div className="rounded-md border px-3">
          <LabelFieldRow label="Uso previsto" value={instructions.uso_previsto} />
          <LabelFieldRow label="Frequenza" value={instructions.frequenza} />
          <LabelFieldRow label="Condizioni stoccaggio" value={instructions.condizioni_stoccaggio} />
        </div>
      </section>

      {cropDoses.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Dosaggi per coltura</h3>
          {cropDoses.map((dose, index) => (
            <CropDoseCard key={`${dose.coltura ?? 'dose'}-${index}`} dose={dose} />
          ))}
        </section>
      )}
    </div>
  );
}

function CropDoseCard({ dose }: { readonly dose: FertilizerCropDose }) {
  const range = [dose.dose_kg_ha_min, dose.dose_kg_ha_max]
    .filter((value) => value !== null && value !== undefined)
    .join(' - ');
  return (
    <div className="rounded-md border px-3">
      <LabelFieldRow label="Coltura" value={dose.coltura} />
      <LabelFieldRow label="Fase fenologica" value={dose.fase_fenologica} />
      <LabelFieldRow label="Dose kg/ha" value={dose.dose_kg_ha} />
      <LabelFieldRow label="Dose min/max kg/ha" value={range || null} />
    </div>
  );
}
