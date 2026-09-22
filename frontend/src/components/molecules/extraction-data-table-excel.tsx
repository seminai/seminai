import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AgGridReact } from "ag-grid-react";
import type { ProcessDataFromClipboardParams } from "ag-grid-community";
import { SelectionActionBar } from "@/components/molecules/selection-action-bar";
import { InvoiceProductTableToolbar } from "@/components/molecules/invoice-product-table-toolbar";
import { registerAgGridModules, seminaiAgGridTheme } from "@/lib/ag-grid-setup";
import { createEmptyInvoiceEntry } from "@/lib/ag-grid/invoice-columns";
import {
  agGridRangesToInvoiceCells,
  getAgGridOcrCorrectionBlockReason,
} from "@/lib/ag-grid/invoice-cell-selection";
import { exportCsv, exportExcel, exportPdf } from "@/lib/export";
import { buildInvoiceEntriesExportParams } from "@/lib/invoice-entry-export";
import { useExportFilename } from "@/hooks/use-export-filename";
import { useRowsHistory } from "@/hooks/use-rows-history";
import { useUndoRedoKeyboard } from "@/hooks/use-undo-redo-keyboard";
import { useSelectionAggregates } from "@/hooks/use-selection-aggregates";
import { useInvoiceOcrCellActions } from "@/hooks/use-invoice-ocr-cell-actions";
import { useInvoiceOcrShortcuts } from "@/hooks/use-invoice-ocr-shortcuts";
import { useInvoiceExcelColumnDefs } from "@/hooks/use-invoice-excel-column-defs";
import { GridStatusBar } from "@/components/atoms/grid-status-bar";
import type { InvoiceCellCoord } from "@/lib/invoice-cell-operations";
import { useCompanyProductCategoryOptions } from '@/hooks/use-company-product-category-options';
import type { ConfirmableStockEntry, ResolvedCategory } from '@/types/extraction';

interface ExtractionDataTableExcelProps {
  readonly category?: ResolvedCategory;
  readonly companyId: string;
  readonly data: readonly ConfirmableStockEntry[];
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly onSave: (rows: readonly ConfirmableStockEntry[]) => Promise<void>;
  readonly headerActions?: ReactNode;
}

registerAgGridModules();

/**
 * AG Grid-based variant of `ExtractionDataTable`. Provides Excel-like editing
 * (single-click edit, clipboard paste from Excel/Sheets, range selection) while
 * preserving the same props contract so the surrounding logic (header actions,
 * Ripristina, Salva modifiche) can stay untouched.
 */
export function ExtractionDataTableExcel({
  category = "invoice",
  companyId,
  data,
  isEditable,
  isSaving,
  onSave,
  headerActions,
}: ExtractionDataTableExcelProps) {
  const { isManufacturing, categoryOptions } = useCompanyProductCategoryOptions(companyId);
  const tableRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<AgGridReact<ConfirmableStockEntry>>(null);
  const [rows, setRows] = useState<ConfirmableStockEntry[]>(() =>
    data.map((row) => ({ ...row })),
  );
  const [selectedCells, setSelectedCells] = useState<readonly InvoiceCellCoord[]>([]);

  const { push, reset, undo, redo } = useRowsHistory<ConfirmableStockEntry>({
    initialState: data,
  });
  const { aggregates, onCellSelectionChanged: updateAggregates } =
    useSelectionAggregates(gridRef);

  useEffect(() => {
    const next = data.map((row) => ({ ...row }));
    // Keep AG Grid row data and undo history aligned with the latest payload.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(next);
    setSelectedCells([]);
    reset(next);
  }, [data, reset]);

  const hasChanges = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(data),
    [rows, data],
  );

  const { columnDefs, defaultColDef } = useInvoiceExcelColumnDefs(
    isEditable,
    isSaving,
    category,
    isManufacturing,
    categoryOptions,
  );

  const syncRowsFromGrid = useCallback(() => {
    if (!gridRef.current?.api) return;
    const next: ConfirmableStockEntry[] = [];
    gridRef.current.api.forEachNode((node) => {
      if (node.data) next.push({ ...node.data });
    });
    setRows(next);
    push(next);
  }, [push]);

  const applyRows = useCallback(
    (nextRows: readonly ConfirmableStockEntry[]) => {
      const next = nextRows.map((row) => ({ ...row }));
      setRows(next);
      gridRef.current?.api?.setGridOption("rowData", next);
      push(next);
    },
    [push],
  );

  const handleRestore = useCallback(() => {
    const restored = data.map((row) => ({ ...row }));
    setRows(restored);
    reset(restored);
  }, [data, reset]);

  const handleAddRow = useCallback(() => {
    setRows((prev) => {
      const template = prev[prev.length - 1] ?? data[0];
      const next = [...prev, createEmptyInvoiceEntry(template)];
      push(next);
      return next;
    });
  }, [data, push]);

  const applySnapshot = useCallback(
    (snapshot: readonly ConfirmableStockEntry[] | undefined) => {
      if (!snapshot) return;
      const next = snapshot.map((r) => ({ ...r }));
      setRows(next);
      gridRef.current?.api?.setGridOption("rowData", next);
    },
    [],
  );

  const handleUndo = useCallback(() => {
    const api = gridRef.current?.api;
    if (api && api.getCurrentUndoSize() > 0) {
      api.undoCellEditing();
      return;
    }
    applySnapshot(undo());
  }, [applySnapshot, undo]);

  const handleRedo = useCallback(() => {
    const api = gridRef.current?.api;
    if (api && api.getCurrentRedoSize() > 0) {
      api.redoCellEditing();
      return;
    }
    applySnapshot(redo());
  }, [applySnapshot, redo]);

  useUndoRedoKeyboard({
    onUndo: handleUndo,
    onRedo: handleRedo,
    enabled: isEditable,
  });

  /**
   * Excel-like paste: if the clipboard has more rows than the grid currently
   * has starting from the focused cell, append the missing empty rows before
   * AG Grid writes the values, so a multi-row paste never loses data.
   */
  const processDataFromClipboard = useCallback(
    (
      params: ProcessDataFromClipboardParams<ConfirmableStockEntry>,
    ): string[][] | null => {
      const clipboardData = params.data;
      if (!clipboardData || clipboardData.length === 0) return clipboardData;
      const api = params.api;
      const focusedCell = api.getFocusedCell();
      if (!focusedCell) return clipboardData;

      const currentRowCount = api.getDisplayedRowCount();
      const neededRowCount = focusedCell.rowIndex + clipboardData.length;
      if (neededRowCount <= currentRowCount) return clipboardData;

      const missing = neededRowCount - currentRowCount;
      const lastNode = api.getDisplayedRowAtIndex(currentRowCount - 1);
      const template = lastNode?.data ?? data[0];
      const newRows = Array.from({ length: missing }, () =>
        createEmptyInvoiceEntry(template),
      );
      api.applyTransaction({ add: newRows });
      return clipboardData;
    },
    [data],
  );

  const handleCellSelectionChanged = useCallback(() => {
    updateAggregates();
    const api = gridRef.current?.api;
    if (!api) {
      setSelectedCells([]);
      return;
    }

    const ranges = api.getCellRanges();
    setSelectedCells(agGridRangesToInvoiceCells(ranges));
  }, [updateAggregates]);

  const selectedRows = useMemo(
    () => getRowsSelectedByCells(rows, selectedCells),
    [rows, selectedCells],
  );

  const getOcrBlockReason = useCallback(
    () => getAgGridOcrCorrectionBlockReason(gridRef.current?.api),
    [],
  );

  const {
    actions: ocrActions,
    confirmationDialog,
    runAction: runOcrAction,
    selectedCellCount,
    selectedLabel,
  } = useInvoiceOcrCellActions({
    rows,
    selectedCells,
    enabled: isEditable && !isSaving,
    applyRows,
    getExtraBlockReason: getOcrBlockReason,
  });

  useInvoiceOcrShortcuts({
    enabled: isEditable && !isSaving && selectedCellCount > 0,
    rootRef: tableRef,
    onAction: runOcrAction,
  });

  const exportFilename = useExportFilename();
  const getExportData = useCallback(
    () => buildInvoiceEntriesExportParams(selectedRows, exportFilename),
    [selectedRows, exportFilename],
  );

  const exportOptions = useMemo(
    () => [
      { label: "CSV", format: "csv" as const, onClick: () => exportCsv(getExportData()) },
      { label: "Excel (.xls)", format: "excel" as const, onClick: () => exportExcel(getExportData()) },
      { label: "PDF (stampa)", format: "pdf" as const, onClick: () => exportPdf(getExportData()) },
    ],
    [getExportData],
  );

  const handleDeselect = useCallback(() => {
    gridRef.current?.api?.clearCellSelection();
    setSelectedCells([]);
    updateAggregates();
  }, [updateAggregates]);

  return (
    <div ref={tableRef} className="flex min-w-0 flex-col gap-2">
      <InvoiceProductTableToolbar
        isEditable={isEditable}
        isSaving={isSaving}
        hasChanges={hasChanges}
        headerActions={headerActions}
        onAddRow={handleAddRow}
        onRestore={handleRestore}
        onSave={() => onSave(rows)}
      />

      <div className="h-[360px] overflow-hidden rounded-md border">
        <AgGridReact<ConfirmableStockEntry>
          ref={gridRef}
          theme={seminaiAgGridTheme}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          cellSelection
          enterNavigatesVerticallyAfterEdit
          enterNavigatesVertically
          undoRedoCellEditing
          undoRedoCellEditingLimit={50}
          stopEditingWhenCellsLoseFocus
          processDataFromClipboard={processDataFromClipboard}
          onCellValueChanged={syncRowsFromGrid}
          onPasteEnd={syncRowsFromGrid}
          onCellSelectionChanged={handleCellSelectionChanged}
        />
      </div>
      <GridStatusBar aggregates={aggregates} />
      <SelectionActionBar
        selectedCount={selectedCellCount}
        actions={ocrActions}
        exportOptions={exportOptions}
        onDeselect={handleDeselect}
        selectedLabel={selectedLabel}
      />
      {confirmationDialog}
    </div>
  );
}

function getRowsSelectedByCells(
  rows: readonly ConfirmableStockEntry[],
  cells: readonly InvoiceCellCoord[],
): readonly ConfirmableStockEntry[] {
  const rowIndexes = new Set(cells.map((cell) => cell.rowIndex));
  return rows.filter((_, rowIndex) => rowIndexes.has(rowIndex));
}

export default ExtractionDataTableExcel;
