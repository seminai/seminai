import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { Polygon } from 'geojson';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import {
  FieldPolygonEditor,
  type PolygonMeta,
} from '@/components/organisms/manual-add/field-polygon-editor';
import type { FieldsBulkValues } from '@/components/organisms/manual-add/fields-bulk-schema';

interface FieldRowCardProps {
  readonly form: UseFormReturn<FieldsBulkValues>;
  readonly index: number;
  readonly disabled: boolean;
  readonly canRemove: boolean;
  readonly onRemove: () => void;
}

export function FieldRowCard({ form, index, disabled, canRemove, onRemove }: FieldRowCardProps) {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [wasAreaAutofilled, setWasAreaAutofilled] = useState(false);
  const errors = form.formState.errors.fields?.[index];
  const polygon = form.watch(`fields.${index}.polygon`) ?? null;

  const handlePolygonChange = (nextPolygon: Polygon | null, meta: PolygonMeta) => {
    form.setValue(`fields.${index}.polygon`, nextPolygon, { shouldDirty: true });
    form.setValue(`fields.${index}.gisHa`, nextPolygon && meta.areaHa ? meta.areaHa : null);
    if (nextPolygon && meta.areaHa) {
      const currentArea = form.getValues(`fields.${index}.superficieCatastaleMq`);
      if (!currentArea || Number.isNaN(currentArea)) {
        form.setValue(
          `fields.${index}.superficieCatastaleMq`,
          Math.round(meta.areaHa * 10000),
          { shouldValidate: true },
        );
        setWasAreaAutofilled(true);
      }
    }
    if (!nextPolygon) setWasAreaAutofilled(false);
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Campo {index + 1}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={!canRemove || disabled}
          aria-label="Rimuovi campo"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      <FormFieldRow id={`f-name-${index}`} label="Nome *" error={errors?.name?.message}>
        <Input id={`f-name-${index}`} {...form.register(`fields.${index}.name`)} disabled={disabled} />
      </FormFieldRow>

      <FormFieldRow id={`f-addr-${index}`} label="Indirizzo *" error={errors?.address?.message}>
        <Input id={`f-addr-${index}`} {...form.register(`fields.${index}.address`)} disabled={disabled} />
      </FormFieldRow>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormFieldRow id={`f-sez-${index}`} label="Sezione *" error={errors?.sezione?.message}>
          <Input id={`f-sez-${index}`} {...form.register(`fields.${index}.sezione`)} disabled={disabled} />
        </FormFieldRow>
        <FormFieldRow id={`f-fog-${index}`} label="Foglio *" error={errors?.foglio?.message}>
          <Input id={`f-fog-${index}`} {...form.register(`fields.${index}.foglio`)} disabled={disabled} />
        </FormFieldRow>
        <FormFieldRow id={`f-par-${index}`} label="Particella *" error={errors?.particella?.message}>
          <Input id={`f-par-${index}`} {...form.register(`fields.${index}.particella`)} disabled={disabled} />
        </FormFieldRow>
      </div>

      <FormFieldRow
        id={`f-sup-${index}`}
        label="Superficie catastale (mq) *"
        error={errors?.superficieCatastaleMq?.message}
      >
        <Input
          id={`f-sup-${index}`}
          type="number"
          inputMode="decimal"
          step="0.01"
          {...form.register(`fields.${index}.superficieCatastaleMq`, { valueAsNumber: true })}
          disabled={disabled}
        />
        {wasAreaAutofilled ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Superficie calcolata dal perimetro — modificabile
          </p>
        ) : null}
      </FormFieldRow>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormFieldRow id={`f-start-${index}`} label="Inizio conduzione">
          <Input
            id={`f-start-${index}`}
            type="date"
            {...form.register(`fields.${index}.inizioConduzione`)}
            disabled={disabled}
          />
        </FormFieldRow>
        <FormFieldRow id={`f-end-${index}`} label="Fine conduzione">
          <Input
            id={`f-end-${index}`}
            type="date"
            {...form.register(`fields.${index}.fineConduzione`)}
            disabled={disabled}
          />
        </FormFieldRow>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Senza date il campo è considerato in conduzione solo per l'anno corrente.
      </p>

      <div className="mt-3 border-t pt-3">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setIsMapOpen((prev) => !prev)}
          aria-expanded={isMapOpen}
          aria-controls={`f-perimeter-${index}`}
        >
          {isMapOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Perimetro (opzionale)
          {polygon && !isMapOpen ? (
            <span className="text-xs text-muted-foreground">— disegnato</span>
          ) : null}
        </button>
        {isMapOpen ? (
          <div id={`f-perimeter-${index}`} className="mt-3">
            <FieldPolygonEditor
              polygon={polygon}
              onPolygonChange={handlePolygonChange}
              disabled={disabled}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
