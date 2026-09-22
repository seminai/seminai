import { useState, useMemo, useCallback } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ResizablePanelLayout } from '@/components/molecules/resizable-panel-layout';
import { ConfirmDeleteDialog } from '@/components/molecules/confirm-delete-dialog';
import { DataTableSwitch } from '@/components/organisms/data-table-switch';
import type { BulkAction } from '@/components/organisms/data-table';
import { FieldDetailPanel } from '@/components/organisms/field-detail-panel';
import {
  useDeleteFieldsBulk,
  useGetFieldsCompanyCompanyId,
  usePutFieldsId,
} from '@/generated/api/fields/fields';
import { useExtractionsByCompany } from '@/hooks/use-extractions';
import { ApiError } from '@/lib/api-client';
import { extractArray } from '@/lib/api-response';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import {
  getEditableFieldProperties,
  getFieldProperties,
  getFieldUpdateData,
  toFieldRow,
  type FieldRow,
} from './fields-master-detail.helpers';

const COLUMN_LABELS: Record<string, string> = {
  name: 'Nome',
  city: 'Comune',
  foglio: 'Foglio',
  particella: 'Particella',
  gisHa: 'GIS (ha)',
  sauHa: 'SAU (ha)',
  soilType: 'Tipo suolo',
};

const columns: ColumnDef<FieldRow, unknown>[] = [
  { accessorKey: 'name', header: 'Nome', filterFn: 'multiValue' as never },
  { accessorKey: 'city', header: 'Comune', filterFn: 'multiValue' as never },
  { accessorKey: 'foglio', header: 'Foglio', filterFn: 'multiValue' as never },
  { accessorKey: 'particella', header: 'Particella', filterFn: 'multiValue' as never },
  { accessorKey: 'gisHa', header: 'GIS (ha)', filterFn: 'multiValue' as never },
  { accessorKey: 'sauHa', header: 'SAU (ha)', filterFn: 'multiValue' as never },
  { accessorKey: 'soilType', header: 'Tipo suolo', filterFn: 'multiValue' as never },
];

interface FieldsMasterDetailProps {
  readonly companyId: string;
}

export function FieldsMasterDetail({ companyId }: FieldsMasterDetailProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<readonly string[] | null>(null);
  const { data: response, isLoading, isError, error, refetch } =
    useGetFieldsCompanyCompanyId(companyId);
  const { data: extractions } = useExtractionsByCompany(companyId);
  const { mutate: updateField, isPending: isSaving } = usePutFieldsId();
  const { mutate: deleteFields, isPending: isDeleting } = useDeleteFieldsBulk({
    mutation: {
      onSuccess: (_, variables) => {
        toast.success(`${variables.data.ids.length} campo/i eliminati`);
        setPendingDeleteIds(null);
        if (pendingDeleteIds?.includes(selectedId ?? '')) setSelectedId(null);
        void refetch();
      },
      onError: (err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Errore eliminazione campi');
        setPendingDeleteIds(null);
      },
    },
  });
  const bulkActions = useMemo<readonly BulkAction<FieldRow>[]>(
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

  const fields = useMemo<FieldRow[]>(() => {
    const list = response?.data ? extractArray(response.data, 'fields') : [];
    const apiFields = list.map((field) => toFieldRow(field, String(field.id ?? '')));
    if (apiFields.length > 0) return apiFields;

    const fallbackFields = (extractions ?? []).flatMap((extraction) => {
      if (extraction.category !== 'fields' && extraction.category !== 'agricultural') {
        return [] as FieldRow[];
      }
      const extractedData = extraction.extractedData as Record<string, unknown> | null;
      if (!extractedData || !Array.isArray(extractedData.fields)) {
        return [] as FieldRow[];
      }
      return extractedData.fields.map((rawField, index) =>
        toFieldRow(rawField as Record<string, unknown>, `${extraction.id}-${index}`),
      );
    });
    return fallbackFields;
  }, [response, extractions]);

  const selected = fields.find((f) => f.id === selectedId);

  const properties = useMemo(() => (selected ? getFieldProperties(selected) : []), [selected]);
  const editableProperties = useMemo(
    () => (selected ? getEditableFieldProperties(selected) : []),
    [selected],
  );

  const handleSave = useCallback(
    (data: Record<string, string>) => {
      if (!selectedId) return;
      updateField(
        {
          id: selectedId,
          data: getFieldUpdateData(data),
        },
        { onSuccess: () => void refetch() },
      );
    },
    [selectedId, updateField, refetch],
  );

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Caricamento campi...</div>;
  }

  if (isError && fields.length === 0) {
    const err = error as unknown;
    const message =
      err != null && typeof err === 'object' && err instanceof ApiError
        ? sanitizeUserFacingText(err.message)
        : 'Impossibile caricare i campi. Verifica di avere accesso a questa azienda.';
    return (
      <p className="py-8 text-center text-sm text-destructive" role="alert">
        {message}
      </p>
    );
  }

  const table = (
    <DataTableSwitch
      data={fields}
      columns={columns}
      columnLabels={COLUMN_LABELS}
      exportSection="campi"
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
      title="Elimina campi selezionati"
      description={
        pendingDeleteIds
          ? `Eliminerai ${pendingDeleteIds.length} camp${pendingDeleteIds.length === 1 ? 'o' : 'i'} e tutte le assegnazioni a unità produttive. L'operazione è irreversibile.`
          : ''
      }
      isPending={isDeleting}
      onConfirm={() => {
        if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;
        deleteFields({ data: { ids: [...pendingDeleteIds] } });
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
          <FieldDetailPanel
            fieldId={selected.id}
            title={selected.name}
            properties={properties}
            editableProperties={editableProperties}
            onSave={handleSave}
            isSaving={isSaving}
            polygon={selected.polygon}
            latitude={selected.latitude}
            longitude={selected.longitude}
            city={selected.city}
            onSavedGeo={() => void refetch()}
            onClose={() => setSelectedId(null)}
          />
        }
      />
      {deleteDialog}
    </>
  );
}
