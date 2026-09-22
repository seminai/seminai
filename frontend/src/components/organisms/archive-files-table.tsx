import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from '@tanstack/react-table';
import { useMemo } from 'react';
import { ExternalLink, FolderPlus, Trash2 } from 'lucide-react';
import { type BulkAction, type StickyColumnConfig } from '@/components/organisms/data-table';
import { DataTableSwitch } from '@/components/organisms/data-table-switch';
import { StatusBadge } from '@/components/atoms/status-badge';
import { FileTypeIcon } from '@/components/atoms/file-type-icon';
import { TruncatedText } from '@/components/atoms/truncated-text';
import { COLUMN_LABELS } from '@/config/constants';
import { formatDate } from '@/lib/format-date';
import type { ArchiveRow } from '@/types/extraction';

interface ArchiveFilesTableProps {
  readonly files: readonly ArchiveRow[];
  readonly totalCount: number;
  readonly serverControlled?: boolean;
  readonly onRowClick?: (file: ArchiveRow) => void;
  readonly columnFilters?: ColumnFiltersState;
  readonly onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  readonly sorting?: SortingState;
  readonly onSortingChange?: (sorting: SortingState) => void;
  readonly onClearFilters?: () => void;
  readonly searchValue?: string;
  readonly onSearchValueChange?: (value: string) => void;
  readonly pagination?: PaginationState;
  readonly onPaginationChange?: (pagination: PaginationState) => void;
  readonly pageCount?: number;
  readonly filterOptions?: Readonly<Record<string, readonly string[]>>;
  readonly onOpenSelected?: (rows: readonly ArchiveRow[]) => void;
  readonly onDeleteRequest?: (rows: readonly ArchiveRow[]) => void;
  readonly selectionResetKey?: number;
}

function ProgressBar({ progress }: { readonly progress: number }) {
  return (
    <div className="flex min-w-0 shrink items-center gap-1.5">
      <div className="h-1 w-12 shrink-0 rounded-full bg-gray-200 sm:h-1.5 sm:w-14">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-[0.65rem] tabular-nums text-muted-foreground sm:text-xs">
        {progress}%
      </span>
    </div>
  );
}

const columns: ColumnDef<ArchiveRow, unknown>[] = [
  {
    accessorKey: 'titolo',
    header: 'Titolo',
    meta: { widthPercent: 28 },
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-2">
        <FileTypeIcon format={row.original.formato} className="shrink-0" />
        <TruncatedText
          text={row.getValue('titolo') as string}
          className="min-w-0 flex-1 font-medium"
          maxWidth="100%"
        />
      </div>
    ),
    filterFn: 'multiValue' as never,
  },
  {
    accessorKey: 'azienda',
    header: 'Azienda',
    meta: { widthPercent: 16 },
    cell: ({ row }) => (
      <TruncatedText text={row.getValue('azienda') as string} maxWidth="100%" />
    ),
    filterFn: 'multiValue' as never,
  },
  {
    accessorKey: 'aggiornato',
    header: 'Aggiornato',
    meta: { widthPercent: 10, filterType: 'dateRange' },
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {formatDate(row.original.aggiornatoIso) || (row.getValue('aggiornato') as string)}
      </span>
    ),
    enableSorting: true,
    sortingFn: (a, b) => {
      const ai = a.original.aggiornatoIso ?? '';
      const bi = b.original.aggiornatoIso ?? '';
      if (ai === bi) return 0;
      return ai < bi ? -1 : 1;
    },
    filterFn: 'dateRange' as never,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    meta: { widthPercent: 15 },
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      if (status === 'In caricamento' && 'progress' in row.original) {
        return (
          <div className="flex min-w-0 flex-nowrap items-center gap-2">
            <StatusBadge status={status} className="shrink-0" />
            <ProgressBar progress={row.original.progress} />
          </div>
        );
      }
      return <StatusBadge status={status} />;
    },
    filterFn: 'multiValue' as never,
  },
  {
    accessorKey: 'tipoDiFile',
    header: 'Tipo di file',
    meta: { widthPercent: 12 },
    cell: ({ row }) => (
      <TruncatedText text={row.getValue('tipoDiFile') as string} maxWidth="100%" />
    ),
    filterFn: 'multiValue' as never,
  },
  {
    accessorKey: 'formato',
    header: 'Formato',
    meta: { widthPercent: 6 },
    filterFn: 'multiValue' as never,
  },
  {
    accessorKey: 'note',
    header: 'Note',
    meta: { widthPercent: 15 },
    cell: ({ row }) => {
      const note = row.getValue('note') as string;
      if (note === '-') return <span className="text-muted-foreground">-</span>;
      return <TruncatedText text={note} maxWidth="100%" />;
    },
    filterFn: 'multiValue' as never,
  },
];

const stickyColumns = {
  select: { left: '0px', width: '44px' },
  titolo: { left: '44px', width: '300px' },
} satisfies Readonly<Record<string, StickyColumnConfig>>;

export function ArchiveFilesTable({
  files,
  totalCount,
  serverControlled = true,
  onRowClick,
  columnFilters,
  onColumnFiltersChange,
  sorting,
  onSortingChange,
  onClearFilters,
  searchValue,
  onSearchValueChange,
  pagination,
  onPaginationChange,
  pageCount,
  filterOptions,
  onOpenSelected,
  onDeleteRequest,
  selectionResetKey,
}: ArchiveFilesTableProps) {
  const bulkActions = useMemo<readonly BulkAction<ArchiveRow>[]>(() => {
    const actions: BulkAction<ArchiveRow>[] = [
      { label: 'Apri', icon: <ExternalLink className="h-4 w-4" />, onClick: (rows) => onOpenSelected?.(rows) },
      { label: 'Aggiungi alla cartella', icon: <FolderPlus className="h-4 w-4" />, onClick: () => {} },
    ];
    if (onDeleteRequest) {
      actions.push({
        label: 'Elimina',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: (rows) => onDeleteRequest(rows),
        variant: 'destructive',
      });
    }
    return actions;
  }, [onOpenSelected, onDeleteRequest]);

  return (
    <DataTableSwitch
      data={files}
      columns={columns}
      getRowClassName={() => 'h-12'}
      getCellClassName={() => 'h-12 max-h-12 align-middle'}
      tableClassName="text-sm sm:text-base"
      minTableWidth="1180px"
      stickyColumns={stickyColumns}
      columnLabels={COLUMN_LABELS}
      bulkActions={bulkActions}
      exportSection="archivio"
      onRowClick={onRowClick}
      columnFilters={columnFilters}
      onColumnFiltersChange={onColumnFiltersChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      onClearFilters={onClearFilters}
      columnWidthMode="percent"
      totalCount={totalCount}
      searchValue={searchValue}
      onSearchValueChange={onSearchValueChange}
      manualFiltering={serverControlled}
      manualSorting={serverControlled}
      manualPagination={serverControlled}
      pagination={serverControlled ? pagination : undefined}
      onPaginationChange={serverControlled ? onPaginationChange : undefined}
      pageCount={serverControlled ? pageCount : undefined}
      filterOptions={filterOptions}
      selectionResetKey={selectionResetKey}
    />
  );
}
