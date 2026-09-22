import { useCallback, useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGetFieldsAvailability } from '@/generated/api/fields/fields';
import { usePutProductionUnitsId } from '@/generated/api/production-units/production-units';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api-client';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import type { ProductionUnitFieldAllocation } from './production-units-master-detail-model';
import {
  areAllocationDraftsDirty,
  areDraftsValid,
  buildAllocationMap,
  createAllocationDrafts,
  filterAvailableFields,
  getRemainingCapacity,
  getRowCapacity,
  mapAvailableFields,
  roundArea,
  type AllocationDraft,
  type AvailableField,
} from './production-unit-field-allocations-utils';

interface ProductionUnitFieldAllocationsProps {
  readonly productionUnitId: string;
  readonly companyId: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly allocations: readonly ProductionUnitFieldAllocation[];
  readonly onSaved: () => Promise<unknown>;
}

export function ProductionUnitFieldAllocations({
  productionUnitId,
  companyId,
  startDate,
  endDate,
  allocations,
  onSaved,
}: ProductionUnitFieldAllocationsProps) {
  const [drafts, setDrafts] = useState<AllocationDraft[]>(() => createAllocationDrafts(allocations));
  const [searchValue, setSearchValue] = useState('');
  const hasDateRange = Boolean(startDate && endDate);
  const { data: availabilityResponse, isFetching, refetch } = useGetFieldsAvailability(
    hasDateRange ? { startAt: startDate ?? undefined, endAt: endDate ?? undefined } : undefined,
    { query: { enabled: hasDateRange } },
  );
  const { mutateAsync: updateProductionUnit, isPending: isSaving } = usePutProductionUnitsId();
  const availableFields = useMemo(
    () => mapAvailableFields(availabilityResponse?.data, companyId),
    [availabilityResponse, companyId],
  );
  const currentAllocationMap = useMemo(
    () => buildAllocationMap(allocations.map((item) => ({ fieldId: item.fieldId, areaHa: item.areaHaOnField }))),
    [allocations],
  );
  const draftAllocationMap = useMemo(() => buildAllocationMap(drafts), [drafts]);
  const availableByFieldId = useMemo(
    () => new Map(availableFields.map((field) => [field.fieldId, field])),
    [availableFields],
  );
  const filteredAvailableFields = useMemo(
    () => filterAvailableFields(availableFields, drafts, searchValue, (fieldId) =>
      getRemainingCapacity(fieldId, availableByFieldId, currentAllocationMap, draftAllocationMap),
    ),
    [availableFields, availableByFieldId, currentAllocationMap, draftAllocationMap, drafts, searchValue],
  );
  const totalAreaHa = useMemo(
    () => roundArea(drafts.reduce((sum, draft) => sum + Math.max(draft.areaHa, 0), 0)),
    [drafts],
  );
  const hasUnsavedChanges = useMemo(
    () => areAllocationDraftsDirty(drafts, allocations),
    [drafts, allocations],
  );
  const updateDraftArea = useCallback((fieldId: string, areaHa: number) => {
    setDrafts((current) =>
      current.map((draft) => (draft.fieldId === fieldId ? { ...draft, areaHa } : draft)),
    );
  }, []);
  const cancelChanges = useCallback(() => {
    setDrafts(createAllocationDrafts(allocations));
  }, [allocations]);
  const removeDraft = useCallback((fieldId: string) => {
    setDrafts((current) => current.filter((draft) => draft.fieldId !== fieldId));
  }, []);
  const addField = useCallback((field: AvailableField) => {
    const capacity = getRemainingCapacity(
      field.fieldId,
      availableByFieldId,
      currentAllocationMap,
      draftAllocationMap,
    );
    const areaHa = roundArea(Math.min(capacity, 1));
    setDrafts((current) => [...current, { fieldId: field.fieldId, fieldName: field.fieldName, areaHa }]);
  }, [availableByFieldId, currentAllocationMap, draftAllocationMap]);
  const saveAllocations = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error('Imposta le date di inizio e fine per calcolare le disponibilità.');
      return;
    }
    if (!areDraftsValid(drafts, availableByFieldId, currentAllocationMap, draftAllocationMap)) {
      toast.error('Controlla le aree allocate: una o più righe superano la disponibilità.');
      return;
    }
    try {
      const validDrafts = drafts.filter((draft) => draft.areaHa > 0);
      const areaHa = roundArea(validDrafts.reduce((sum, draft) => sum + draft.areaHa, 0));
      await updateProductionUnit({
        id: productionUnitId,
        data: {
          areaHa,
          startDate,
          endDate,
          allocations: validDrafts.map((draft) => ({ fieldId: draft.fieldId, areaHa: draft.areaHa })),
        },
      });
      toast.success('Campi allocati aggiornati con successo');
      setDrafts(validDrafts);
      await onSaved();
      await refetch();
    } catch (error) {
      const message = error instanceof ApiError
        ? sanitizeUserFacingText(error.message)
        : 'Errore durante il salvataggio dei campi allocati.';
      toast.error(message);
    }
  }, [
    availableByFieldId,
    currentAllocationMap,
    draftAllocationMap,
    drafts,
    endDate,
    onSaved,
    productionUnitId,
    refetch,
    startDate,
    updateProductionUnit,
  ]);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Campi allocati</h3>
          <p className="text-xs text-muted-foreground">Totale allocato: {totalAreaHa.toLocaleString('it-IT')} ha</p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={cancelChanges}
            disabled={isSaving || !hasUnsavedChanges}
          >
            Annulla
          </Button>
          <Button
            size="sm"
            onClick={() => void saveAllocations()}
            disabled={isSaving || !hasDateRange || !hasUnsavedChanges}
          >
            Salva campi
          </Button>
        </div>
      </div>
      {!hasDateRange ? (
        <p className="rounded-lg border p-3 text-xs text-muted-foreground">
          Inserisci inizio e fine periodo della PU per vedere le aree disponibili.
        </p>
      ) : null}
      <AllocationRows
        drafts={drafts}
        availableByFieldId={availableByFieldId}
        currentAllocationMap={currentAllocationMap}
        draftAllocationMap={draftAllocationMap}
        isSaving={isSaving}
        onAreaChange={updateDraftArea}
        onRemove={removeDraft}
      />
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Cerca campo disponibile"
            className="pl-8"
            disabled={!hasDateRange}
          />
        </div>
        <AvailableFieldsList
          fields={filteredAvailableFields}
          isLoading={isFetching}
          onAdd={addField}
          getCapacity={(fieldId) =>
            getRemainingCapacity(fieldId, availableByFieldId, currentAllocationMap, draftAllocationMap)
          }
        />
      </div>
    </section>
  );
}

interface AllocationRowsProps {
  readonly drafts: readonly AllocationDraft[];
  readonly availableByFieldId: ReadonlyMap<string, AvailableField>;
  readonly currentAllocationMap: ReadonlyMap<string, number>;
  readonly draftAllocationMap: ReadonlyMap<string, number>;
  readonly isSaving: boolean;
  readonly onAreaChange: (fieldId: string, areaHa: number) => void;
  readonly onRemove: (fieldId: string) => void;
}

function AllocationRows({
  drafts,
  availableByFieldId,
  currentAllocationMap,
  draftAllocationMap,
  isSaving,
  onAreaChange,
  onRemove,
}: AllocationRowsProps) {
  if (drafts.length === 0) {
    return <p className="rounded-lg border p-3 text-xs text-muted-foreground">Nessun campo allocato.</p>;
  }
  return (
    <div className="space-y-2">
      {drafts.map((draft) => {
        const rowCapacity = getRowCapacity(draft, availableByFieldId, currentAllocationMap, draftAllocationMap);
        return (
          <div key={draft.fieldId} className="rounded-lg border p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{draft.fieldName}</p>
                <p className="text-xs text-muted-foreground">Disponibile: {rowCapacity.toLocaleString('it-IT')} ha</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => onRemove(draft.fieldId)} disabled={isSaving}>
                <Trash2 />
              </Button>
            </div>
            <Input
              type="number"
              min={0}
              max={rowCapacity}
              step="any"
              value={String(draft.areaHa)}
              onChange={(event) => onAreaChange(draft.fieldId, Number(event.target.value))}
              disabled={isSaving}
            />
          </div>
        );
      })}
    </div>
  );
}

interface AvailableFieldsListProps {
  readonly fields: readonly AvailableField[];
  readonly isLoading: boolean;
  readonly onAdd: (field: AvailableField) => void;
  readonly getCapacity: (fieldId: string) => number;
}

function AvailableFieldsList({ fields, isLoading, onAdd, getCapacity }: AvailableFieldsListProps) {
  if (isLoading) return <p className="text-xs text-muted-foreground">Caricamento disponibilità...</p>;
  if (fields.length === 0) return <p className="text-xs text-muted-foreground">Nessun campo disponibile.</p>;
  return (
    <div className="max-h-56 space-y-2 overflow-auto">
      {fields.map((field) => {
        const capacity = getCapacity(field.fieldId);
        return (
          <div key={field.fieldId} className="flex items-center justify-between gap-2 rounded-lg border p-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{field.fieldName}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="outline">{capacity.toLocaleString('it-IT')} ha liberi</Badge>
                <Badge variant="secondary">{field.companyName}</Badge>
              </div>
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => onAdd(field)} disabled={capacity <= 0}>
              <Plus />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
