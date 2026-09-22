import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent } from 'ag-grid-community';
import { registerAgGridModules, seminaiAgGridTheme } from '@/lib/ag-grid-setup';
import { useRowsHistory } from '@/hooks/use-rows-history';
import { useUndoRedoKeyboard } from '@/hooks/use-undo-redo-keyboard';
import { useSelectionAggregates } from '@/hooks/use-selection-aggregates';
import { GridStatusBar } from '@/components/atoms/grid-status-bar';
import {
  EditableExtractionColumnMenu,
  type EditableExtractionColumn,
} from '@/components/molecules/editable-extraction-column-menu';

interface EditableExtractionTableExcelProps {
  readonly title: string;
  readonly headers: readonly string[];
  readonly columns?: readonly EditableExtractionColumn[];
  readonly rows: readonly string[][];
  readonly editable?: boolean;
  readonly onRowsChange?: (rows: string[][]) => void;
}

registerAgGridModules();

type RowModel = Record<string, string>;

function toRowModels(rows: readonly string[][], columns: readonly EditableExtractionColumn[]): RowModel[] {
  return rows.map((row) => {
    const model: RowModel = {};
    columns.forEach((_, index) => {
      model[`c${index}`] = row[index] ?? '';
    });
    return model;
  });
}

function toMatrix(rowModels: readonly RowModel[], columns: readonly EditableExtractionColumn[]): string[][] {
  return rowModels.map((model) => columns.map((_, index) => model[`c${index}`] ?? ''));
}

/**
 * AG Grid-based editable variant of the extraction review table. Enables:
 * - Single-click editing on every cell
 * - Native clipboard paste from Excel/Google Sheets (TSV ranges)
 * - Range selection and copy with Ctrl+C
 *
 * Emits `onRowsChange` with the same `string[][]` shape as the classic table so
 * callers never need to branch on view mode.
 */
export function EditableExtractionTableExcel({
  title,
  headers,
  columns,
  rows,
  editable = false,
  onRowsChange,
}: EditableExtractionTableExcelProps) {
  const gridRef = useRef<AgGridReact<RowModel>>(null);
  const { aggregates, onCellSelectionChanged } = useSelectionAggregates(gridRef);
  const resolvedColumns = useMemo<readonly EditableExtractionColumn[]>(
    () => columns ?? headers.map((label, index) => ({ id: `c${index}`, label })),
    [columns, headers],
  );
  const defaultVisibleColumnIds = useMemo(
    () => resolvedColumns.filter((column) => column.defaultVisible !== false).map((column) => column.id),
    [resolvedColumns],
  );
  const [visibleColumnIds, setVisibleColumnIds] = useState<readonly string[]>(defaultVisibleColumnIds);

  const rowData = useMemo(() => toRowModels(rows, resolvedColumns), [rows, resolvedColumns]);

  const columnDefs = useMemo<ColDef<RowModel>[]>(
    () => {
      const visibleIds = new Set(visibleColumnIds);
      return resolvedColumns.map((column, index) => ({
        colId: `c${index}`,
        field: `c${index}`,
        headerName: column.label,
        hide: !visibleIds.has(column.id),
        editable: editable && column.readOnly !== true,
        sortable: true,
        filter: true,
        floatingFilter: false,
        resizable: true,
        singleClickEdit: editable && column.readOnly !== true,
      }));
    },
    [resolvedColumns, visibleColumnIds, editable],
  );

  const defaultColDef = useMemo<ColDef<RowModel>>(
    () => ({ flex: 1, minWidth: 120, editable, singleClickEdit: editable }),
    [editable],
  );

  const history = useRowsHistory<string[]>({ initialState: rows });

  const emitChange = useCallback(() => {
    if (!editable || !onRowsChange || !gridRef.current?.api) return;
    const nextRows: RowModel[] = [];
    gridRef.current.api.forEachNode((node) => {
      if (node.data) nextRows.push(node.data);
    });
    const matrix = toMatrix(nextRows, resolvedColumns);
    history.push(matrix);
    onRowsChange(matrix);
  }, [editable, resolvedColumns, history, onRowsChange]);

  const handleCellValueChanged = useCallback(() => emitChange(), [emitChange]);
  const handlePasteEnd = useCallback(() => emitChange(), [emitChange]);

  const handleUndo = useCallback(() => {
    const api = gridRef.current?.api;
    if (api && api.getCurrentUndoSize() > 0) {
      api.undoCellEditing();
      return;
    }
    const prev = history.undo();
    if (prev && onRowsChange) onRowsChange([...prev]);
  }, [history, onRowsChange]);

  const handleRedo = useCallback(() => {
    const api = gridRef.current?.api;
    if (api && api.getCurrentRedoSize() > 0) {
      api.redoCellEditing();
      return;
    }
    const next = history.redo();
    if (next && onRowsChange) onRowsChange([...next]);
  }, [history, onRowsChange]);

  useUndoRedoKeyboard({ onUndo: handleUndo, onRedo: handleRedo, enabled: editable });

  const handleGridReady = useCallback((event: GridReadyEvent<RowModel>) => {
    event.api.sizeColumnsToFit();
  }, []);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {columns ? (
          <EditableExtractionColumnMenu
            columns={resolvedColumns}
            visibleColumnIds={visibleColumnIds}
            onVisibleColumnIdsChange={setVisibleColumnIds}
          />
        ) : null}
      </div>
      <div className="h-[320px] overflow-hidden rounded-md border">
        <AgGridReact<RowModel>
          ref={gridRef}
          theme={seminaiAgGridTheme}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          cellSelection
          enterNavigatesVerticallyAfterEdit
          enterNavigatesVertically
          undoRedoCellEditing
          undoRedoCellEditingLimit={50}
          stopEditingWhenCellsLoseFocus
          onGridReady={handleGridReady}
          onCellValueChanged={handleCellValueChanged}
          onPasteEnd={handlePasteEnd}
          onCellSelectionChanged={onCellSelectionChanged}
        />
      </div>
      <GridStatusBar aggregates={aggregates} />
    </div>
  );
}

export default EditableExtractionTableExcel;
