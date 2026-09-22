import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable, type BulkAction } from '@/components/organisms/data-table';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/molecules/confirm-delete-dialog';
import { LabelCategoryBadge } from '@/components/molecules/labels/label-category-badge';
import { LabelVerifiedBadge } from '@/components/molecules/labels/label-verified-badge';
import { LabelCreateSheet } from '@/components/organisms/labels/label-create-sheet';
import { useLabelsSummary } from '@/hooks/use-labels-summary';
import { useCanModifyLabels } from '@/hooks/use-can-modify-labels';
import {
  useDeleteLabelsBulk,
  getGetLabelsSummaryQueryKey,
} from '@/generated/api/labels/labels';
import { formatConfidence, type LabelSummaryRow } from '@/types/label';

const dateFormatter = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });

const COLUMN_LABELS: Record<string, string> = {
  productName: 'Nome commerciale',
  registrationNumber: 'N. registrazione',
  category: 'Categoria',
  isVerified: 'Verificata',
  extractionConfidence: 'Qualità estrazione',
  createdAt: 'Data creazione',
};

const columns: ColumnDef<LabelSummaryRow, unknown>[] = [
  { accessorKey: 'productName', header: 'Nome commerciale' },
  { accessorKey: 'registrationNumber', header: 'N. registrazione' },
  {
    accessorKey: 'category',
    header: 'Categoria',
    cell: ({ row }) => <LabelCategoryBadge category={row.original.category} />,
  },
  {
    accessorKey: 'isVerified',
    header: 'Verificata',
    cell: ({ row }) => <LabelVerifiedBadge isVerified={row.original.isVerified} />,
  },
  {
    accessorKey: 'extractionConfidence',
    header: 'Qualità estrazione',
    cell: ({ row }) => formatConfidence(row.original.extractionConfidence),
  },
  {
    accessorKey: 'createdAt',
    header: 'Data creazione',
    cell: ({ row }) =>
      row.original.createdAt ? dateFormatter.format(new Date(row.original.createdAt)) : '—',
  },
];

interface LabelsTableProps {
  readonly onRowClick: (row: LabelSummaryRow) => void;
}

/** Lists the global product-label registry with create + bulk-delete (gated by role). */
export function LabelsTable({ onRowClick }: LabelsTableProps) {
  const queryClient = useQueryClient();
  const canModify = useCanModifyLabels();
  const { labels, isLoading, isError } = useLabelsSummary();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);

  const deleteMutation = useDeleteLabelsBulk({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetLabelsSummaryQueryKey() });
        toast.success('Etichette eliminate');
        setPendingIds([]);
        setSelectionResetKey((key) => key + 1);
      },
      onError: () => toast.error("Errore durante l'eliminazione"),
    },
  });

  const bulkActions = useMemo<readonly BulkAction<LabelSummaryRow>[]>(() => {
    if (!canModify) return [];
    return [
      {
        label: 'Elimina',
        icon: <Trash2 className="h-4 w-4" />,
        variant: 'destructive',
        onClick: (rows) => setPendingIds(rows.map((r) => r.id)),
      },
    ];
  }, [canModify]);

  if (isError) {
    return <p className="p-4 text-sm text-destructive">Impossibile caricare le etichette.</p>;
  }
  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Caricamento etichette…</p>;
  }

  return (
    <>
      <DataTable
        data={labels}
        columns={columns}
        columnLabels={COLUMN_LABELS}
        bulkActions={bulkActions}
        showSelectionColumn={canModify}
        onRowClick={(row) => onRowClick(row)}
        getRowId={(row) => row.id}
        exportSection="etichette"
        selectionResetKey={selectionResetKey}
        toolbarRightSlot={
          canModify ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Aggiungi
            </Button>
          ) : undefined
        }
      />
      <ConfirmDeleteDialog
        open={pendingIds.length > 0}
        onOpenChange={(open) => {
          if (!open) setPendingIds([]);
        }}
        title="Eliminare le etichette selezionate?"
        description={`Stai per eliminare ${pendingIds.length} etichetta/e. L'azione non è reversibile.`}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate({ data: { ids: [...pendingIds] } })}
      />
      <LabelCreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
