import { useState, useMemo, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { ResizablePanelLayout } from '@/components/molecules/resizable-panel-layout';
import { ConfirmDeleteDialog } from '@/components/molecules/confirm-delete-dialog';
import { DataTableSwitch } from '@/components/organisms/data-table-switch';
import type { BulkAction } from '@/components/organisms/data-table';
import { EntityDetailPanel } from '@/components/organisms/entity-detail-panel';
import { ProductionUnitFieldAllocations } from '@/components/organisms/production-unit-field-allocations';
import {
  useDeleteProductionUnitsBulk,
  useGetProductionUnits,
  usePutProductionUnitsId,
} from '@/generated/api/production-units/production-units';
import { useExtractionsByCompany } from '@/hooks/use-extractions';
import { ApiError } from '@/lib/api-client';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import type { PropertyItem } from '@/components/molecules/entity-property-list';
import type { EditablePropertyItem } from '@/components/molecules/editable-property-list';
import { toast } from 'sonner';
import { buildProductionUnitDetailUpdatePayload } from './production-unit-detail-update-payload';
import {
  PRODUCTION_UNIT_COLUMN_LABELS,
  mapProductionUnitRows,
  productionUnitColumns,
  type PuRow,
} from './production-units-master-detail-model';

interface ProductionUnitsMasterDetailProps {
  readonly companyId: string;
}

export function ProductionUnitsMasterDetail({ companyId }: ProductionUnitsMasterDetailProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<readonly string[] | null>(null);
  const { data: response, isLoading, isError, error, refetch } = useGetProductionUnits();
  const { data: extractions } = useExtractionsByCompany(companyId);
  const { mutateAsync: updateProductionUnit, isPending: isSaving } = usePutProductionUnitsId();
  const { mutate: deleteProductionUnits, isPending: isDeleting } = useDeleteProductionUnitsBulk({
    mutation: {
      onSuccess: (_, variables) => {
        toast.success(`${variables.data.ids.length} unità produttiv${variables.data.ids.length === 1 ? 'a' : 'e'} eliminat${variables.data.ids.length === 1 ? 'a' : 'e'}`);
        const wasSelectedDeleted = pendingDeleteIds?.includes(selectedId ?? '');
        setPendingDeleteIds(null);
        if (wasSelectedDeleted) setSelectedId(null);
        void refetch();
      },
      onError: (err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Errore eliminazione unità produttive');
        setPendingDeleteIds(null);
      },
    },
  });
  const bulkActions = useMemo<readonly BulkAction<PuRow>[]>(
    () => [
      {
        label: 'Elimina',
        icon: <Trash2 className="h-4 w-4" />,
        variant: 'destructive',
        onClick: (rows) => setPendingDeleteIds(rows.map((r) => r.id)),
      },
    ],
    [],
  );

  const units = useMemo<PuRow[]>(() => {
    return mapProductionUnitRows(response?.data, companyId, extractions);
  }, [response, companyId, extractions]);

  const selected = units.find((u) => u.id === selectedId);

  const properties = useMemo<PropertyItem[]>(
    () =>
      selected
        ? [
            { label: 'Nome', value: selected.name },
            { label: 'Coltura', value: selected.cropName },
            { label: 'Tipo coltura', value: selected.cropType },
            { label: 'Varietà', value: selected.variety },
            { label: 'Protocollo', value: selected.protocoll },
            { label: 'Struttura di protezione', value: selected.protectionStructure },
            { label: 'Area (ha)', value: selected.areaHa },
            { label: 'Inizio', value: selected.startDate },
            { label: 'Fioritura', value: selected.floweringDate },
            { label: 'Raccolta', value: selected.harvestingDate },
            { label: 'Fine', value: selected.endDate },
            { label: 'Occupazione', value: selected.occupazione },
            { label: 'Destinazione d’uso', value: selected.destinazioneDiUso },
            { label: 'Acqua totale periodo (L)', value: selected.acquaTotalePeridoL },
            { label: 'Anno stagione', value: selected.seasonYear },
            { label: 'Indice ciclo', value: selected.cycleIndex },
            { label: 'Azienda', value: selected.companyName },
          ]
        : [],
    [selected],
  );

  const editableProperties = useMemo<EditablePropertyItem[]>(
    () =>
      selected
        ? [
            { label: 'Nome', value: selected.name, key: 'name' },
            { label: 'Coltura', value: selected.cropName, key: 'cropName' },
            { label: 'Tipo coltura', value: selected.cropType, key: 'cropType' },
            { label: 'Varietà', value: selected.variety, key: 'variety' },
            { label: 'Protocollo', value: selected.protocoll, key: 'protocoll' },
            {
              label: 'Struttura di protezione',
              value: selected.protectionStructure,
              key: 'protectionStructure',
            },
            { label: 'Area (ha)', value: selected.areaHa, key: 'areaHa', type: 'number' },
            { label: 'Inizio', value: selected.startDate, key: 'startDate', type: 'date' },
            {
              label: 'Fioritura',
              value: selected.floweringDate,
              key: 'floweringDate',
              type: 'date',
            },
            {
              label: 'Raccolta',
              value: selected.harvestingDate,
              key: 'harvestingDate',
              type: 'date',
            },
            { label: 'Fine', value: selected.endDate, key: 'endDate', type: 'date' },
            { label: 'Occupazione', value: selected.occupazione, key: 'occupazione' },
            {
              label: 'Destinazione d’uso',
              value: selected.destinazioneDiUso,
              key: 'destinazioneDiUso',
            },
            {
              label: 'Acqua totale periodo (L)',
              value: selected.acquaTotalePeridoL,
              key: 'acquaTotalePeridoL',
              type: 'number',
            },
            { label: 'Anno stagione', value: selected.seasonYear, key: 'seasonYear', type: 'number' },
            { label: 'Indice ciclo', value: selected.cycleIndex, key: 'cycleIndex', type: 'number' },
            { label: 'Azienda', value: selected.companyName, key: 'companyName', editable: false },
          ]
        : [],
    [selected],
  );

  const handleSave = useCallback(
    async (data: Record<string, string>) => {
      if (!selectedId) return;
      try {
        await updateProductionUnit({
          id: selectedId,
          data: buildProductionUnitDetailUpdatePayload(data),
        });
        toast.success('Unità produttiva aggiornata con successo');
        await refetch();
      } catch (error) {
        const message =
          error instanceof ApiError
            ? sanitizeUserFacingText(error.message)
            : 'Errore durante il salvataggio dell’unità produttiva.';
        toast.error(message);
        throw error;
      }
    },
    [selectedId, updateProductionUnit, refetch],
  );

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Caricamento unità produttive...</div>;
  }

  if (isError && units.length === 0) {
    const message =
      error instanceof ApiError
        ? sanitizeUserFacingText(error.message)
        : 'Impossibile caricare le unità produttive.';
    return (
      <p className="py-8 text-center text-sm text-destructive" role="alert">
        {message}
      </p>
    );
  }

  const table = (
    <DataTableSwitch
      data={units}
      columns={productionUnitColumns}
      columnLabels={PRODUCTION_UNIT_COLUMN_LABELS}
      exportSection="unita-produttive"
      bulkActions={bulkActions}
      onRowClick={(row) => setSelectedId(row.id === selectedId ? null : row.id)}
    />
  );

  const deleteDialog = (
    <ConfirmDeleteDialog
      open={pendingDeleteIds !== null}
      onOpenChange={(open) => {
        if (!open) setPendingDeleteIds(null);
      }}
      title="Elimina unità produttive selezionate"
      description={
        pendingDeleteIds
          ? `Eliminerai ${pendingDeleteIds.length} unità produttiv${pendingDeleteIds.length === 1 ? 'a' : 'e'} e tutte le operazioni e assegnazioni a campi collegate. L'operazione è irreversibile.`
          : ''
      }
      isPending={isDeleting}
      onConfirm={() => {
        if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;
        deleteProductionUnits({ data: { ids: [...pendingDeleteIds] } });
      }}
    />
  );

  if (!selected) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {table}
        {deleteDialog}
      </div>
    );
  }

  return (
    <>
      <ResizablePanelLayout
        left={<div className="flex min-h-0 min-w-0 flex-1 flex-col">{table}</div>}
        right={
          <EntityDetailPanel
            title={selected.name}
            properties={properties}
            editableProperties={editableProperties}
            onSave={handleSave}
            isSaving={isSaving}
            onClose={() => setSelectedId(null)}
          >
            <ProductionUnitFieldAllocations
              key={selected.id}
              productionUnitId={selected.id}
              companyId={companyId}
              startDate={selected.startDate}
              endDate={selected.endDate}
              allocations={selected.fields}
              onSaved={refetch}
            />
          </EntityDetailPanel>
        }
      />
      {deleteDialog}
    </>
  );
}
