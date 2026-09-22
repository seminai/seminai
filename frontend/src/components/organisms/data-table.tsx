import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  type Cell,
  type ColumnDef,
  type PaginationState,
  type Row,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTableToolbar } from './data-table-toolbar';
import { ColumnFilter } from '@/components/molecules/column-filter';
import {
  DateRangeFilter,
  type DateRangeFilterValue,
} from '@/components/molecules/date-range-filter';
import { SelectionActionBar } from '@/components/molecules/selection-action-bar';
import { TruncatedText } from '@/components/atoms/truncated-text';
import { exportCsv, exportExcel, exportPdf } from '@/lib/export';
import { buildTableExportParams } from '@/lib/table-export';
import { useExportFilename } from '@/hooks/use-export-filename';
import { getSafeColumnLabel } from '@/lib/safe-display';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface BulkAction<TData = unknown> {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly onClick: (rows: readonly TData[]) => void;
  readonly variant?: 'default' | 'destructive' | 'outline' | 'ghost';
}

export interface DataTableCellClassContext {
  readonly columnId: string;
  readonly isFirstVisibleCell: boolean;
  readonly isLastVisibleCell: boolean;
}

export interface StickyColumnConfig {
  readonly left: string;
  readonly width?: string;
}

interface DataTableProps<TData> {
  readonly data: readonly TData[];
  readonly columns: ColumnDef<TData, unknown>[];
  readonly columnLabels?: Record<string, string>;
  readonly bulkActions?: readonly BulkAction<TData>[];
  readonly onRowClick?: (row: TData, event: MouseEvent<HTMLTableRowElement>) => void;
  readonly onShare?: () => void;
  readonly defaultVisibility?: VisibilityState;
  readonly exportSection?: string;
  readonly columnFilters?: ColumnFiltersState;
  readonly onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  readonly sorting?: SortingState;
  readonly onSortingChange?: (sorting: SortingState) => void;
  readonly onClearFilters?: () => void;
  readonly totalCount?: number;
  readonly searchValue?: string;
  readonly onSearchValueChange?: (value: string) => void;
  readonly searchPlaceholder?: string;
  readonly manualPagination?: boolean;
  readonly manualSorting?: boolean;
  readonly manualFiltering?: boolean;
  readonly pageCount?: number;
  readonly pagination?: PaginationState;
  readonly onPaginationChange?: (pagination: PaginationState) => void;
  /** When 'percent', column widths use meta.widthPercent and table fills container. */
  readonly columnWidthMode?: 'fixed' | 'percent';
  /** When false, hides the leading checkbox column and row selection (e.g. job operations table). */
  readonly showSelectionColumn?: boolean;
  readonly getRowClassName?: (originalRow: TData) => string | undefined;
  /** Extra classes per cell (e.g. rounded row outline on first/last cells). */
  readonly getCellClassName?: (
    originalRow: TData,
    context: DataTableCellClassContext,
  ) => string | undefined;
  readonly secondaryFooter?: React.ReactNode;
  readonly toolbarStatsText?: (count: number) => string;
  /** When set, replaces the right-side stats text in the toolbar (e.g. an action button). */
  readonly toolbarRightSlot?: ReactNode;
  readonly getRowId?: (originalRow: TData, index: number) => string;
  /** Merged with default `table-fixed` on the inner `<table>`. */
  readonly tableClassName?: string;
  /** Optional minimum width that lets wide tables scroll horizontally. */
  readonly minTableWidth?: string;
  /** Sticky column offsets keyed by column id. */
  readonly stickyColumns?: Readonly<Record<string, StickyColumnConfig>>;
  /** External filter options per column (key = accessorKey). Overrides faceted values. */
  readonly filterOptions?: Readonly<Record<string, readonly string[]>>;
  /** When this value changes, the row selection is cleared. */
  readonly selectionResetKey?: number;
  /** Extra columns appended only to exports (CSV/Excel/PDF), never rendered in the table. */
  readonly extraExportColumns?: ReadonlyArray<{
    readonly label: string;
    readonly getValue: (row: TData) => unknown;
  }>;
}

function multiValueFilter(
  row: { getValue: (id: string) => unknown },
  columnId: string,
  filterValue: string[],
) {
  if (!filterValue || filterValue.length === 0) return true;
  const value = String(row.getValue(columnId));
  return filterValue.includes(value);
}

function dateRangeFilter<TData>(
  row: {
    original: TData;
    getValue: (id: string) => unknown;
  },
  columnId: string,
  filterValue: DateRangeFilterValue | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _addMeta?: unknown,
): boolean {
  if (!filterValue || (!filterValue.from && !filterValue.to)) return true;
  const original = row.original as Record<string, unknown> | null | undefined;
  const fromOriginal = original?.[`${columnId}Iso`];
  const iso = typeof fromOriginal === 'string' && fromOriginal.length > 0
    ? fromOriginal
    : String(row.getValue(columnId) ?? '');
  if (!iso) return false;
  if (filterValue.from && iso < filterValue.from) return false;
  if (filterValue.to && iso > `${filterValue.to}T23:59:59.999Z`) return false;
  return true;
}

interface DataTableTruncatedValueProps {
  readonly value: unknown;
  readonly className?: string;
}

export function DataTableTruncatedValue({
  value,
  className,
}: DataTableTruncatedValueProps) {
  if (value == null || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  return <TruncatedText text={String(value)} maxWidth="100%" className={className} />;
}

function renderDataTableCell<TData>(cell: Cell<TData, unknown>): ReactNode {
  const columnDef = cell.column.columnDef;
  if (columnDef.cell !== undefined) {
    return flexRender(columnDef.cell, cell.getContext());
  }
  return <DataTableTruncatedValue value={cell.getValue()} />;
}

export function DataTable<TData>({
  data,
  columns,
  columnLabels = {},
  bulkActions = [],
  onRowClick,
  onShare,
  defaultVisibility = {},
  exportSection,
  columnFilters: externalFilters,
  onColumnFiltersChange: externalOnFiltersChange,
  sorting: externalSorting,
  onSortingChange: externalOnSortingChange,
  onClearFilters,
  totalCount,
  searchValue,
  onSearchValueChange,
  searchPlaceholder,
  manualPagination = false,
  manualSorting = false,
  manualFiltering = false,
  pageCount,
  pagination: externalPagination,
  onPaginationChange: externalOnPaginationChange,
  columnWidthMode = 'fixed',
  showSelectionColumn = true,
  getRowClassName,
  getCellClassName,
  secondaryFooter,
  toolbarStatsText,
  toolbarRightSlot,
  getRowId: getRowIdProp,
  tableClassName,
  minTableWidth,
  stickyColumns,
  filterOptions,
  selectionResetKey,
  extraExportColumns,
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalFilters, setInternalFilters] = useState<ColumnFiltersState>([]);
  const [internalPagination, setInternalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  const sorting = externalSorting ?? internalSorting;
  const columnFilters = externalFilters ?? internalFilters;
  const pagination = externalPagination ?? internalPagination;

  const setSorting = (updater: SortingState | ((prev: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    if (externalOnSortingChange) externalOnSortingChange(next);
    else setInternalSorting(next);
  };

  const setColumnFilters = (updater: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => {
    const next = typeof updater === 'function' ? updater(columnFilters) : updater;
    if (externalOnFiltersChange) externalOnFiltersChange(next);
    else setInternalFilters(next);
  };

  const setPagination = (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    if (externalOnPaginationChange) externalOnPaginationChange(next);
    else setInternalPagination(next);
  };
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(defaultVisibility);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  useEffect(() => {
    if (selectionResetKey === undefined) return;
    setRowSelection({});
  }, [selectionResetKey]);

  const selectColumn: ColumnDef<TData, unknown> = {
    id: 'select',
    header: ({ table: t }) => (
      <Checkbox
        indeterminate={t.getIsSomePageRowsSelected()}
        checked={t.getIsAllPageRowsSelected()}
        onCheckedChange={(checked) =>
          t.toggleAllPageRowsSelected(!!checked)
        }
        aria-label="Seleziona tutti"
      />
    ),
    cell: ({ row }) => (
      <div
        className="flex size-full min-h-0 min-w-0 items-center"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(!!checked)}
          aria-label="Seleziona riga"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
    ...(columnWidthMode === 'percent' ? { meta: { widthPercent: 3 } as const } : {}),
  };

  const allColumns = showSelectionColumn ? [selectColumn, ...columns] : columns;

  const table = useReactTable({
    data: data as TData[],
    columns: allColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: manualFiltering ? undefined : getFilteredRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    filterFns: { multiValue: multiValueFilter, dateRange: dateRangeFilter },
    enableRowSelection: showSelectionColumn,
    getRowId: getRowIdProp
      ? (row, index) => getRowIdProp(row as TData, index)
      : undefined,
    manualPagination,
    manualFiltering,
    manualSorting,
    pageCount,
  });

  const selectedCount = Object.keys(rowSelection).length;

  const boundActions = useMemo(
    () =>
      bulkActions.map((action) => ({
        ...action,
        onClick: () => action.onClick(table.getSelectedRowModel().rows.map((r) => r.original)),
      })),
    [bulkActions, table],
  );

  const getStickyStyle = useCallback(
    (columnId: string): CSSProperties | undefined => {
      const sticky = stickyColumns?.[columnId];
      if (!sticky) return undefined;

      return {
        left: sticky.left,
        minWidth: sticky.width,
        width: sticky.width,
        maxWidth: sticky.width,
      };
    },
    [stickyColumns],
  );

  const exportFilename = useExportFilename({ section: exportSection });
  const getExportData = useCallback(() => {
    const visibleCols = table
      .getVisibleLeafColumns()
      .filter((col) => col.id !== 'select');

    const selectedRows = table
      .getSelectedRowModel()
      .rows;

    const baseColumns = visibleCols.map((col) => ({
      label: getSafeColumnLabel(col.id, columnLabels),
      getValue: (row: Row<TData>) => row.getValue(col.id),
    }));
    const wrappedExtraColumns = extraExportColumns
      ? extraExportColumns.map((col) => ({
          label: col.label,
          getValue: (row: Row<TData>) => col.getValue(row.original),
        }))
      : [];

    return buildTableExportParams<Row<TData>>({
      columns: [...baseColumns, ...wrappedExtraColumns],
      rows: selectedRows,
      filename: exportFilename,
    });
  }, [table, columnLabels, exportFilename, extraExportColumns]);

  const exportOptions = [
    { label: 'CSV', format: 'csv' as const, onClick: () => exportCsv(getExportData()) },
    { label: 'Excel (.xls)', format: 'excel' as const, onClick: () => exportExcel(getExportData()) },
    { label: 'PDF (stampa)', format: 'pdf' as const, onClick: () => exportPdf(getExportData()) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-background">
      <DataTableToolbar
        table={table}
        totalCount={totalCount ?? data.length}
        statsText={toolbarStatsText}
        rightSlot={toolbarRightSlot}
        onShare={onShare}
        columnLabels={columnLabels}
        onClearAll={onClearFilters}
        searchValue={searchValue}
        onSearchValueChange={onSearchValueChange}
        searchPlaceholder={searchPlaceholder}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <table
          data-slot="table"
          className={cn(
            'w-full caption-bottom text-xs sm:text-sm',
            'table-fixed',
            tableClassName,
          )}
          style={{ minWidth: minTableWidth }}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id;
                  const pct = header.column.columnDef.meta?.widthPercent as number | undefined;
                  const usePct = columnWidthMode === 'percent' && pct != null;
                  const stickyStyle = getStickyStyle(columnId);
                  return (
                  <TableHead
                    key={header.id}
                    style={{
                      width: stickyStyle?.width ?? (usePct ? `${pct}%` : `${header.getSize()}px`),
                      ...stickyStyle,
                    }}
                    className={cn(
                      'sticky top-0 z-30 h-10 min-w-0 overflow-hidden bg-background',
                      stickyStyle && 'z-40',
                    )}
                  >
                    {header.isPlaceholder ? null : header.column.getCanFilter() ? (
                      header.column.columnDef.meta?.filterType === 'dateRange' ? (
                        <DateRangeFilter
                          column={header.column}
                          title={getSafeColumnLabel(header.column.id, columnLabels)}
                        />
                      ) : (
                        <ColumnFilter
                          column={header.column}
                          title={getSafeColumnLabel(header.column.id, columnLabels)}
                          externalOptions={filterOptions?.[header.column.id]}
                        />
                      )
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Nessun risultato.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const visibleCells = row.getVisibleCells();
                return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn(
                    'transition-colors',
                    row.getIsSelected() && 'bg-accent/50',
                    onRowClick && 'cursor-pointer',
                    getRowClassName?.(row.original),
                  )}
                  onClick={(event) => onRowClick?.(row.original, event)}
                >
                  {visibleCells.map((cell, cellIndex) => {
                    const stickyStyle = getStickyStyle(cell.column.id);
                    return (
                      <TableCell
                        key={cell.id}
                        style={stickyStyle}
                        className={cn(
                          stickyStyle && [
                            'sticky z-20 border-r',
                            row.getIsSelected() ? 'bg-accent' : 'bg-background',
                          ],
                          getCellClassName?.(row.original, {
                            columnId: cell.column.id,
                            isFirstVisibleCell: cellIndex === 0,
                            isLastVisibleCell: cellIndex === visibleCells.length - 1,
                          }),
                        )}
                      >
                        {renderDataTableCell(cell)}
                      </TableCell>
                    );
                  })}
                </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      <SelectionActionBar
        selectedCount={selectedCount}
        actions={boundActions}
        exportOptions={exportOptions}
        onDeselect={() => setRowSelection({})}
      />
      <div className="border-t">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <span>Righe per pagina</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) => {
                const nextSize = Number(value);
                setPagination({
                  pageIndex: 0,
                  pageSize: nextSize,
                });
              }}
            >
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground sm:text-sm">
              Pagina {pagination.pageIndex + 1} di {Math.max(table.getPageCount(), 1)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {secondaryFooter ? <div className="border-t px-4 py-2">{secondaryFooter}</div> : null}
      </div>
    </div>
  );
}
