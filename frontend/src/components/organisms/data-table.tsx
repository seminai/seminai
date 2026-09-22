import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
} from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  type ColumnDef,
  type PaginationState,
  type Row,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableToolbar } from './data-table-toolbar';
import { SelectionActionBar } from '@/components/molecules/selection-action-bar';
import { exportCsv, exportExcel, exportPdf } from '@/lib/export';
import { buildTableExportParams } from '@/lib/table-export';
import { useExportFilename } from '@/hooks/use-export-filename';
import { getSafeColumnLabel } from '@/lib/safe-display';
import type { DataTableProps } from './data-table-types';
import { dateRangeFilter, multiValueFilter } from './data-table-filters';
import { DataTableGrid } from './data-table-grid';
import { DataTablePagination } from './data-table-pagination';

export type { BulkAction, DataTableCellClassContext, StickyColumnConfig } from './data-table-types';
export { DataTableTruncatedValue } from './data-table-cell';

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

  const setColumnFilters = (
    updater: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState),
  ) => {
    const next = typeof updater === 'function' ? updater(columnFilters) : updater;
    if (externalOnFiltersChange) externalOnFiltersChange(next);
    else setInternalFilters(next);
  };

  const setPagination = (
    updater: PaginationState | ((prev: PaginationState) => PaginationState),
  ) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    if (externalOnPaginationChange) externalOnPaginationChange(next);
    else setInternalPagination(next);
  };
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(defaultVisibility);
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
        onCheckedChange={(checked) => t.toggleAllPageRowsSelected(!!checked)}
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

  // TanStack Table intentionally returns non-memoizable callbacks managed by its own state machine.
  // eslint-disable-next-line react-hooks/incompatible-library
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
    getRowId: getRowIdProp ? (row, index) => getRowIdProp(row as TData, index) : undefined,
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
    const visibleCols = table.getVisibleLeafColumns().filter((col) => col.id !== 'select');

    const selectedRows = table.getSelectedRowModel().rows;

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
    {
      label: 'Excel (.xls)',
      format: 'excel' as const,
      onClick: () => exportExcel(getExportData()),
    },
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

      <DataTableGrid
        table={table}
        allColumns={allColumns}
        columnLabels={columnLabels}
        columnWidthMode={columnWidthMode}
        tableClassName={tableClassName}
        minTableWidth={minTableWidth}
        filterOptions={filterOptions}
        onRowClick={onRowClick}
        getRowClassName={getRowClassName}
        getCellClassName={getCellClassName}
        getStickyStyle={getStickyStyle}
      />

      <SelectionActionBar
        selectedCount={selectedCount}
        actions={boundActions}
        exportOptions={exportOptions}
        onDeselect={() => setRowSelection({})}
      />
      <DataTablePagination
        table={table}
        pagination={pagination}
        onPaginationChange={setPagination}
        secondaryFooter={secondaryFooter}
      />
    </div>
  );
}
