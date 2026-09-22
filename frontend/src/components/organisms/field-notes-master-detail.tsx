import { useState, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ResizablePanelLayout } from '@/components/molecules/resizable-panel-layout';
import { DataTableSwitch } from '@/components/organisms/data-table-switch';
import { FieldNoteDetailPanel } from '@/components/organisms/field-note-detail-panel';
import { useFieldNotesByCompany } from '@/hooks/use-field-notes';
import type { FieldNoteResponse } from '@/types/field-note';
import { FIELD_NOTE_CATEGORY_LABELS, FIELD_NOTE_STATUS_LABELS } from '@/types/field-note';

interface FieldNoteRow {
  readonly id: string;
  readonly category: string;
  readonly status: string;
  readonly rawContent: string;
  readonly fieldName: string;
  readonly productionUnitName: string;
  readonly operationDate: string;
}

const COLUMN_LABELS: Record<string, string> = {
  category: 'Categoria',
  status: 'Stato',
  rawContent: 'Contenuto',
  fieldName: 'Campo',
  productionUnitName: 'Unità Produttiva',
  operationDate: 'Data Operazione',
};

const columns: ColumnDef<FieldNoteRow, unknown>[] = [
  { accessorKey: 'category', header: 'Categoria', filterFn: 'multiValue' as never },
  { accessorKey: 'status', header: 'Stato', filterFn: 'multiValue' as never },
  { accessorKey: 'rawContent', header: 'Contenuto' },
  { accessorKey: 'fieldName', header: 'Campo', filterFn: 'multiValue' as never },
  { accessorKey: 'productionUnitName', header: 'Unità Produttiva', filterFn: 'multiValue' as never },
  { accessorKey: 'operationDate', header: 'Data Operazione' },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toRow(fn: FieldNoteResponse): FieldNoteRow {
  return {
    id: fn.id,
    category: FIELD_NOTE_CATEGORY_LABELS[fn.category] ?? fn.category,
    status: FIELD_NOTE_STATUS_LABELS[fn.status] ?? fn.status,
    rawContent: fn.rawContent,
    fieldName: fn.field?.name ?? '-',
    productionUnitName: fn.productionUnit?.name ?? '-',
    operationDate: formatDate(fn.operationDate),
  };
}

interface FieldNotesMasterDetailProps {
  readonly companyId: string;
}

export function FieldNotesMasterDetail({ companyId }: FieldNotesMasterDetailProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const resolvedCompanyId = companyId === 'no-company' ? null : companyId;
  const { fieldNotes, isLoading, isError, refetch } = useFieldNotesByCompany(resolvedCompanyId);

  const rows = useMemo(() => fieldNotes.map(toRow), [fieldNotes]);
  const selectedNote = fieldNotes.find((fn) => fn.id === selectedId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Caricamento note di campo...
      </div>
    );
  }

  if (isError && rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-destructive" role="alert">
        Impossibile caricare le note di campo.
      </p>
    );
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Non ci sono note di campo</p>;
  }

  const table = (
    <DataTableSwitch
      data={rows}
      columns={columns}
      columnLabels={COLUMN_LABELS}
      exportSection="note-di-campo"
      onRowClick={(row) => setSelectedId(row.id === selectedId ? null : row.id)}
    />
  );

  if (!selectedNote) return <div className="flex h-full flex-col">{table}</div>;

  return (
    <ResizablePanelLayout
      left={<div className="flex h-full flex-col">{table}</div>}
      right={
        <FieldNoteDetailPanel
          fieldNote={selectedNote}
          companyId={companyId}
          onSaved={() => void refetch()}
          onClose={() => setSelectedId(null)}
        />
      }
    />
  );
}
