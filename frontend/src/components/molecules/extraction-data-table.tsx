import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { SelectionActionBar } from '@/components/molecules/selection-action-bar';
import { InvoiceProductTableToolbar } from '@/components/molecules/invoice-product-table-toolbar';
import { InvoiceProductTableHeader } from '@/components/molecules/invoice-product-table-header';
import {
  InvoiceProductTableRow,
  type InvoiceEditingCell,
  type InvoiceProductGridColumn,
} from '@/components/molecules/invoice-product-table-row';
import { useSpreadsheet, type PastePayload, type SelectionBounds } from '@/hooks/use-spreadsheet';
import {
  applyCellValue,
  createEmptyInvoiceEntry,
  getColumnsForCategory,
} from '@/lib/ag-grid/invoice-columns';
import { spreadsheetSelectionToInvoiceCells } from '@/lib/invoice-cell-operations';
import { exportCsv, exportExcel, exportPdf } from '@/lib/export';
import {
  buildInvoiceEntriesExportParams,
  getRowsSelectedBySpreadsheet,
} from '@/lib/invoice-entry-export';
import { useExportFilename } from '@/hooks/use-export-filename';
import { useInvoiceOcrCellActions } from '@/hooks/use-invoice-ocr-cell-actions';
import { useInvoiceOcrShortcuts } from '@/hooks/use-invoice-ocr-shortcuts';
import { useCompanyProductCategoryOptions } from '@/hooks/use-company-product-category-options';
import type { ConfirmableStockEntry, ResolvedCategory } from '@/types/extraction';

interface ExtractionDataTableProps {
  readonly category?: ResolvedCategory;
  readonly companyId: string;
  readonly data: readonly ConfirmableStockEntry[];
  readonly isEditable: boolean;
  readonly isSaving: boolean;
  readonly onSave: (rows: readonly ConfirmableStockEntry[]) => Promise<void>;
  readonly headerActions?: ReactNode;
}

export function ExtractionDataTable({
  category = 'invoice',
  companyId,
  data,
  isEditable,
  isSaving,
  onSave,
  headerActions,
}: ExtractionDataTableProps) {
  const { isManufacturing, categoryOptions } = useCompanyProductCategoryOptions(companyId);
  const columns = useMemo(
    () => getColumnsForCategory(category, isManufacturing),
    [category, isManufacturing],
  );
  const gridColumns: readonly InvoiceProductGridColumn[] = useMemo(
    () =>
      columns.map((col) => ({
        ...col,
        width: col.key === 'productName' ? 'minmax(180px, 1fr)' : `${col.minWidth}px`,
      })),
    [columns],
  );
  const tableRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<ConfirmableStockEntry[]>(() => data.map((row) => ({ ...row })));
  const [editing, setEditing] = useState<InvoiceEditingCell | null>(null);

  useEffect(() => {
    // Keep the editable draft aligned when the extraction payload changes.

    setRows(data.map((row) => ({ ...row })));
    setEditing(null);
  }, [data]);

  const hasChanges = useMemo(() => JSON.stringify(rows) !== JSON.stringify(data), [rows, data]);

  const updateRows = useCallback((updated: ConfirmableStockEntry[]) => {
    setRows(updated);
  }, []);

  const handleCopy = useCallback(
    (bounds: SelectionBounds): string | null => {
      const lines: string[] = [];
      for (let rowIndex = bounds.minRow; rowIndex <= bounds.maxRow; rowIndex++) {
        const cells: string[] = [];
        for (let colIndex = bounds.minCol; colIndex <= bounds.maxCol; colIndex++) {
          const row = rows[rowIndex];
          const field = gridColumns[colIndex]?.key;
          if (!row || !field) {
            cells.push('');
            continue;
          }
          const rawValue = (row as unknown as Record<string, unknown>)[field];
          cells.push(rawValue == null ? '' : String(rawValue));
        }
        lines.push(cells.join('\t'));
      }
      return lines.join('\n');
    },
    [gridColumns, rows],
  );

  const handlePaste = useCallback(
    ({ anchor, data: clipboardMatrix }: PastePayload) => {
      if (!isEditable || isSaving) return;

      const updated = [...rows];
      const neededRows = anchor.row + clipboardMatrix.length;
      while (updated.length < neededRows) {
        const template = updated[updated.length - 1] ?? data[0];
        updated.push(createEmptyInvoiceEntry(template));
      }

      for (let r = 0; r < clipboardMatrix.length; r++) {
        for (let c = 0; c < clipboardMatrix[r].length; c++) {
          const targetRow = anchor.row + r;
          const targetCol = anchor.col + c;
          if (targetCol >= gridColumns.length) continue;
          updated[targetRow] = applyCellValue(
            { ...updated[targetRow] },
            gridColumns[targetCol].key,
            clipboardMatrix[r][c],
          );
        }
      }

      updateRows(updated);
      setEditing(null);
    },
    [data, gridColumns, isEditable, isSaving, rows, updateRows],
  );

  const {
    containerRef,
    selectCell,
    selectColumn,
    selectRow,
    selected,
    clearSelection,
    isCellSelected,
    isColumnSelected,
    isRowSelected,
  } = useSpreadsheet({
    rowCount: rows.length,
    colCount: gridColumns.length,
    onPaste: handlePaste,
    onCopy: handleCopy,
  });

  const selectedRows = useMemo(
    () => getRowsSelectedBySpreadsheet(rows, selected),
    [rows, selected],
  );
  const selectedCells = useMemo(() => spreadsheetSelectionToInvoiceCells(selected), [selected]);

  const applyOcrRows = useCallback((nextRows: readonly ConfirmableStockEntry[]) => {
    setRows(nextRows.map((row) => ({ ...row })));
    setEditing(null);
  }, []);

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
    applyRows: applyOcrRows,
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
      { label: 'CSV', format: 'csv' as const, onClick: () => exportCsv(getExportData()) },
      {
        label: 'Excel (.xls)',
        format: 'excel' as const,
        onClick: () => exportExcel(getExportData()),
      },
      { label: 'PDF (stampa)', format: 'pdf' as const, onClick: () => exportPdf(getExportData()) },
    ],
    [getExportData],
  );

  function handleCellClick(rowIndex: number, colIndex: number, shiftKey: boolean) {
    if (!isEditable || isSaving) return;
    selectCell(rowIndex, colIndex, shiftKey);
    if (!shiftKey) {
      setEditing({ rowIndex, colIndex });
    } else {
      setEditing(null);
    }
  }

  function handleChange(rowIndex: number, colIndex: number, value: string) {
    const field = gridColumns[colIndex].key;
    const updated = rows.map((r, i) => (i === rowIndex ? applyCellValue(r, field, value) : r));
    updateRows(updated);
  }

  function handleBlur() {
    setEditing(null);
  }

  const handleAddRow = useCallback(() => {
    setRows((prev) => {
      const template = prev[prev.length - 1] ?? data[0];
      return [...prev, createEmptyInvoiceEntry(template)];
    });
    setEditing(null);
  }, [data]);

  const gridCols = `40px ${gridColumns.map((c) => c.width).join(' ')}`;

  return (
    <div ref={tableRef} className="flex min-w-0 flex-col gap-2">
      <InvoiceProductTableToolbar
        isEditable={isEditable}
        isSaving={isSaving}
        hasChanges={hasChanges}
        headerActions={headerActions}
        onAddRow={handleAddRow}
        onRestore={() => setRows(data.map((row) => ({ ...row })))}
        onSave={() => onSave(rows)}
      />

      <div
        ref={containerRef}
        className={`overflow-auto rounded-md border border-border outline-none ${!isEditable ? 'opacity-85' : ''}`}
        tabIndex={isEditable ? 0 : -1}
      >
        <InvoiceProductTableHeader
          columns={gridColumns}
          gridCols={gridCols}
          isEditable={isEditable}
          isSaving={isSaving}
          isColumnSelected={isColumnSelected}
          onColumnClick={(colIndex, shiftKey) => {
            selectColumn(colIndex, shiftKey);
            setEditing(null);
          }}
        />

        {rows.map((row, rowIndex) => (
          <InvoiceProductTableRow
            key={`${row.productName}-${rowIndex}`}
            row={row}
            rowIndex={rowIndex}
            columns={gridColumns}
            gridCols={gridCols}
            isEditable={isEditable}
            isSaving={isSaving}
            editing={editing}
            isManufacturing={isManufacturing}
            categoryOptions={categoryOptions}
            isRowSelected={isRowSelected}
            isCellSelected={isCellSelected}
            onRowHeaderClick={(targetRow, shiftKey) => {
              selectRow(targetRow, shiftKey);
              setEditing(null);
            }}
            onCellClick={handleCellClick}
            onCellChange={handleChange}
            onCellBlur={handleBlur}
            onCancelEditing={() => setEditing(null)}
          />
        ))}
      </div>
      <SelectionActionBar
        selectedCount={selectedCellCount}
        actions={ocrActions}
        exportOptions={exportOptions}
        onDeselect={clearSelection}
        selectedLabel={selectedLabel}
      />
      {confirmationDialog}
    </div>
  );
}
