import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ExternalLink, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AllocationRowEditor } from '@/components/molecules/allocation-row-editor';
import { ExcludedFieldsList } from '@/components/molecules/excluded-fields-list';
import type { ExcludedFieldInfo } from '@/lib/field-exclusion-reason';
import {
  clampAreaToCapacity,
  getWizardFieldMaxForUnit,
  getWizardRemainingCapacity,
  getWizardRowMaxCapacity,
  roundArea,
  sumWorkingAllocations,
  type AvailableField,
} from '@/components/organisms/manual-add/production-units-wizard-allocation-utils';
import { allocationsMapToRows } from '@/components/organisms/manual-add/production-units-wizard-types';

interface ProductionUnitsWizardStepAllocationsProps {
  readonly workingAllocations: ReadonlyMap<string, number>;
  readonly availableFields: readonly AvailableField[];
  readonly excludedFields: readonly ExcludedFieldInfo[];
  readonly companyId: string;
  readonly sessionUsedByFieldId: ReadonlyMap<string, number>;
  readonly isLoading: boolean;
  readonly disabled?: boolean;
  readonly onWorkingChange: (next: Map<string, number>) => void;
  readonly onBack: () => void;
  readonly onAssociate: () => void;
}

export function ProductionUnitsWizardStepAllocations({
  workingAllocations,
  availableFields,
  excludedFields,
  companyId,
  sessionUsedByFieldId,
  isLoading,
  disabled,
  onWorkingChange,
  onBack,
  onAssociate,
}: ProductionUnitsWizardStepAllocationsProps) {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');

  const availableByFieldId = useMemo(
    () => new Map(availableFields.map((field) => [field.fieldId, field])),
    [availableFields],
  );

  const fieldNameById = useMemo(
    () => new Map(availableFields.map((field) => [field.fieldId, field.fieldName])),
    [availableFields],
  );

  const rows = useMemo(
    () => allocationsMapToRows(workingAllocations, fieldNameById),
    [fieldNameById, workingAllocations],
  );

  const sauTotal = sumWorkingAllocations(workingAllocations);

  const filteredAddableFields = useMemo(() => {
    const search = searchValue.trim().toLowerCase();
    const selected = new Set(workingAllocations.keys());
    return availableFields.filter((field) => {
      if (selected.has(field.fieldId)) return false;
      const capacity = getWizardRemainingCapacity(
        field.fieldId,
        availableByFieldId,
        workingAllocations,
        sessionUsedByFieldId,
      );
      if (capacity <= 0) return false;
      if (!search) return true;
      return (
        field.fieldName.toLowerCase().includes(search) ||
        field.companyName.toLowerCase().includes(search)
      );
    });
  }, [availableByFieldId, availableFields, searchValue, sessionUsedByFieldId, workingAllocations]);

  function updateRowArea(fieldId: string, areaHa: number) {
    const max = getWizardRowMaxCapacity(
      fieldId,
      availableByFieldId,
      workingAllocations,
      sessionUsedByFieldId,
      0,
    );
    const next = new Map(workingAllocations);
    const clamped = clampAreaToCapacity(areaHa, max);
    if (clamped <= 0) next.delete(fieldId);
    else next.set(fieldId, clamped);
    onWorkingChange(next);
  }

  function setMaxForField(fieldId: string) {
    const max = getWizardFieldMaxForUnit(fieldId, availableByFieldId, sessionUsedByFieldId);
    const next = new Map(workingAllocations);
    next.set(fieldId, max);
    onWorkingChange(next);
  }

  function removeField(fieldId: string) {
    const next = new Map(workingAllocations);
    next.delete(fieldId);
    onWorkingChange(next);
  }

  function addField(field: AvailableField) {
    const capacity = getWizardRemainingCapacity(
      field.fieldId,
      availableByFieldId,
      workingAllocations,
      sessionUsedByFieldId,
    );
    const next = new Map(workingAllocations);
    next.set(field.fieldId, roundArea(Math.min(capacity, 1)));
    onWorkingChange(next);
  }

  const canAssociate = rows.length > 0 && rows.every((row) => row.areaHa > 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Allocazioni correnti</h2>
          <p className="text-xs text-muted-foreground">
            SAU totale allocata: <span className="font-medium">{sauTotal.toLocaleString('it-IT')} ha</span>
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento disponibilità...</p>
        ) : null}

        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aggiungi parcelle dalla lista sotto e imposta gli ettari da allocare.
          </p>
        ) : null}

        <div className="space-y-2">
          {rows.map((row) => (
            <AllocationRowEditor
              key={row.fieldId}
              row={row}
              maxCapacity={getWizardRowMaxCapacity(
                row.fieldId,
                availableByFieldId,
                workingAllocations,
                sessionUsedByFieldId,
                row.areaHa,
              )}
              disabled={disabled}
              onAreaChange={(areaHa) => updateRowArea(row.fieldId, areaHa)}
              onMax={() => setMaxForField(row.fieldId)}
              onRemove={() => removeField(row.fieldId)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Campi disponibili</h2>
        <div className="relative mb-3">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Cerca campo..."
            className="pl-8"
            disabled={disabled || isLoading}
          />
        </div>
        {!isLoading && availableFields.length === 0 ? (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              Nessun campo con SAU disponibile nel periodo selezionato.
            </p>
            <p className="mt-1">
              {excludedFields.length > 0
                ? 'I campi dell\'azienda sono elencati sotto con il motivo dell\'esclusione: correggi date o superfici in Archivio → Campi, oppure modifica il periodo nel passo precedente.'
                : 'Verifica il periodo di conduzione dei campi (Archivio → Campi) o modifica il periodo unità produttiva nel passo precedente: potrebbero non sovrapporsi.'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void navigate({ to: '/archivio', search: { companyId } })}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Apri Archivio → Campi
            </Button>
          </div>
        ) : filteredAddableFields.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nessun campo disponibile da aggiungere.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-auto">
            {filteredAddableFields.map((field) => {
              const capacity = getWizardRemainingCapacity(
                field.fieldId,
                availableByFieldId,
                workingAllocations,
                sessionUsedByFieldId,
              );
              return (
                <div
                  key={field.fieldId}
                  className="flex items-center justify-between gap-2 rounded-md border p-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{field.fieldName}</p>
                    <Badge variant="outline" className="mt-1">
                      Disp. {capacity.toLocaleString('it-IT')} ha
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => addField(field)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Aggiungi
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {!isLoading ? (
          <ExcludedFieldsList
            fields={excludedFields}
            defaultOpen={availableFields.length === 0}
          />
        ) : null}
      </section>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={onBack}>
          Indietro
        </Button>
        <Button type="button" disabled={disabled || !canAssociate} onClick={onAssociate}>
          Associa
        </Button>
      </div>
    </div>
  );
}
