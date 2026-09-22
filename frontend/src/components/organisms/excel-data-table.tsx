import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridReadyEvent,
  RowClickedEvent,
  SelectionChangedEvent,
} from 'ag-grid-community';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { SelectionActionBar } from '@/components/molecules/selection-action-bar';
import { GridStatusBar } from '@/components/atoms/grid-status-bar';
import { exportCsv, exportExcel, exportPdf } from '@/lib/export';
import { buildTableExportParams } from '@/lib/table-export';
import { getSafeColumnLabel } from '@/lib/safe-display';
import { registerAgGridModules, seminaiAgGridTheme } from '@/lib/ag-grid-setup';
import { columnDefsToColDefs } from '@/lib/ag-grid/column-def-adapter';
import { useSelectionAggregates } from '@/hooks/use-selection-aggregates';
import { useExportFilename } from '@/hooks/use-export-filename';
import type { BulkAction } from './data-table';
import type { ColumnDef } from '@tanstack/react-table';

interface ExcelDataTableProps<TData> {
  readonly data: readonly TData[];
  readonly columns: ColumnDef<TData, unknown>[];
  readonly columnLabels?: Record<string, string>;
  readonly bulkActions?: readonly BulkAction<TData>[];
  readonly onRowClick?: (row: TData, event: ReactMouseEvent<HTMLTableRowElement>) => void;
  readonly onShare?: () => void;
  readonly exportSection?: string;
  readonly totalCount?: number;
  readonly searchValue?: string;
  readonly onSearchValueChange?: (value: string) => void;
  readonly searchPlaceholder?: string;
  readonly showSelectionColumn?: boolean;
  readonly toolbarStatsText?: (count: number) => string;
  /** When set, replaces the right-side stats badge in the toolbar (e.g. an action button). */
  readonly toolbarRightSlot?: ReactNode;
  readonly getRowId?: (originalRow: TData, index: number) => string;
  /** Extra columns appended only to exports, never rendered in the grid. */
  readonly extraExportColumns?: ReadonlyArray<{
    readonly label: string;
    readonly getValue: (row: TData) => unknown;
  }>;
}

registerAgGridModules();

const DEFAULT_COL_DEF: ColDef = {
  flex: 1,
  minWidth: 120,
  filter: true,
  floatingFilter: false,
  resizable: true,
  sortable: true,
  wrapText: false,
  autoHeight: false,
  cellStyle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tooltipValueGetter: (params) => {
    const value = params.value;
    if (value == null || value === '') return undefined;
    return String(value);
  },
};

export function ExcelDataTable<TData>({
  data,
  columns,
  columnLabels = {},
  bulkActions = [],
  onRowClick,
  onShare,
  exportSection,
  totalCount,
  searchValue,
  onSearchValueChange,
  searchPlaceholder = 'Cerca...',
  showSelectionColumn = true,
  toolbarStatsText,
  toolbarRightSlot,
  getRowId,
  extraExportColumns,
}: ExcelDataTableProps<TData>) {
  const gridRef = useRef<AgGridReact<TData>>(null);
  const [selectedRows, setSelectedRows] = useState<readonly TData[]>([]);
  const [internalSearch, setInternalSearch] = useState('');
  const { aggregates, onCellSelectionChanged } = useSelectionAggregates(gridRef);

  const searchText = searchValue ?? internalSearch;
  const setSearchText = onSearchValueChange ?? setInternalSearch;

  const colDefs = useMemo<ColDef<TData>[]>(() => {
    return columnDefsToColDefs(columns, columnLabels);
  }, [columns, columnLabels]);

  const visibleCount = totalCount ?? data.length;
  const statsLabel = toolbarStatsText
    ? toolbarStatsText(visibleCount)
    : `${visibleCount} righe totali`;

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setGridOption('quickFilterText', searchText);
  }, [searchText]);

  const handleGridReady = useCallback((event: GridReadyEvent<TData>) => {
    event.api.sizeColumnsToFit();
  }, []);

  const handleSelectionChanged = useCallback(
    (event: SelectionChangedEvent<TData>) => {
      setSelectedRows(event.api.getSelectedRows());
    },
    [],
  );

  const handleRowClicked = useCallback(
    (event: RowClickedEvent<TData>) => {
      if (!onRowClick || !event.data) return;
      const nativeEvent = event.event as unknown as ReactMouseEvent<HTMLTableRowElement>;
      onRowClick(event.data, nativeEvent);
    },
    [onRowClick],
  );

  const getRowIdFn = useMemo(() => {
    if (!getRowId) return undefined;
    return (params: { data: TData }) => getRowId(params.data, 0);
  }, [getRowId]);

  const boundActions = useMemo(
    () =>
      bulkActions.map((action) => ({
        ...action,
        onClick: () => action.onClick(selectedRows),
      })),
    [bulkActions, selectedRows],
  );

  const exportFilename = useExportFilename({ section: exportSection });
  const getExportData = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return { headers: [], rows: [], filename: exportFilename };

    const visibleCols = api.getAllDisplayedColumns().filter((col) => {
      const id = col.getColId();
      return id !== 'ag-Grid-SelectionCheckbox' && id !== 'selection';
    });

    const sourceRows = selectedRows.length > 0 ? selectedRows : data;

    const baseColumns = visibleCols.map((col) => {
      const def = col.getColDef();
      return {
        label: def.headerName ?? getSafeColumnLabel(col.getColId(), columnLabels),
        getValue: (row: TData) => {
          const record = row as Record<string, unknown>;
          return record[col.getColId()];
        },
      };
    });

    return buildTableExportParams<TData>({
      columns: extraExportColumns ? [...baseColumns, ...extraExportColumns] : baseColumns,
      rows: sourceRows,
      filename: exportFilename,
    });
  }, [columnLabels, data, exportFilename, selectedRows, extraExportColumns]);

  const exportOptions = useMemo(
    () => [
      { label: 'CSV', format: 'csv' as const, onClick: () => exportCsv(getExportData()) },
      { label: 'Excel (.xls)', format: 'excel' as const, onClick: () => exportExcel(getExportData()) },
      { label: 'PDF (stampa)', format: 'pdf' as const, onClick: () => exportPdf(getExportData()) },
    ],
    [getExportData],
  );

  const handleDeselect = useCallback(() => {
    gridRef.current?.api?.deselectAll();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
        {toolbarRightSlot ?? (
          <Badge variant="secondary" className="text-xs">
            {statsLabel}
          </Badge>
        )}
        <Input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 w-full max-w-sm"
        />
        {onShare ? (
          <Button variant="outline" size="sm" onClick={onShare}>
            <Share2 className="mr-2 h-4 w-4" />
            Condividi
          </Button>
        ) : null}
      </div>

      <div className="min-h-[400px] flex-1">
        <AgGridReact<TData>
          ref={gridRef}
          theme={seminaiAgGridTheme}
          rowData={data as TData[]}
          columnDefs={colDefs}
          defaultColDef={DEFAULT_COL_DEF}
          tooltipShowDelay={300}
          tooltipShowMode="whenTruncated"
          rowSelection={
            showSelectionColumn
              ? {
                  mode: 'multiRow',
                  checkboxes: true,
                  headerCheckbox: true,
                  copySelectedRows: true,
                }
              : undefined
          }
          cellSelection
          enterNavigatesVerticallyAfterEdit
          enterNavigatesVertically
          animateRows
          pagination
          paginationPageSize={50}
          paginationPageSizeSelector={[25, 50, 100, 200]}
          getRowId={getRowIdFn}
          onGridReady={handleGridReady}
          onSelectionChanged={handleSelectionChanged}
          onRowClicked={handleRowClicked}
          onCellSelectionChanged={onCellSelectionChanged}
        />
      </div>

      <GridStatusBar aggregates={aggregates} />

      <SelectionActionBar
        selectedCount={selectedRows.length}
        actions={boundActions}
        exportOptions={exportOptions}
        onDeselect={handleDeselect}
      />
    </div>
  );
}

export default ExcelDataTable;
