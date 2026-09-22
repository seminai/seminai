import type { CellRange, GridApi } from 'ag-grid-community';
import {
  isInvoiceColumnKey,
  normalizeInvoiceCellSelection,
  type InvoiceCellCoord,
} from '@/lib/invoice-cell-operations';
import type { ConfirmableStockEntry } from '@/types/extraction';

export function agGridRangesToInvoiceCells(
  ranges: readonly CellRange[] | null,
): readonly InvoiceCellCoord[] {
  if (!ranges || ranges.length === 0) return [];

  const cells: InvoiceCellCoord[] = [];
  for (const range of ranges) {
    const startIdx = range.startRow?.rowIndex ?? 0;
    const endIdx = range.endRow?.rowIndex ?? 0;
    const top = Math.min(startIdx, endIdx);
    const bottom = Math.max(startIdx, endIdx);

    for (let rowIndex = top; rowIndex <= bottom; rowIndex++) {
      for (const column of range.columns) {
        const columnId = column.getColId();
        if (isInvoiceColumnKey(columnId)) cells.push({ rowIndex, columnKey: columnId });
      }
    }
  }

  return normalizeInvoiceCellSelection(cells);
}

export function getAgGridOcrCorrectionBlockReason(
  api: GridApi<ConfirmableStockEntry> | undefined,
): string | null {
  if (!api) return null;
  const hasSortedColumns = api.getColumnState().some((column) => column.sort != null);
  if (api.isAnyFilterPresent() || hasSortedColumns) {
    return 'Disattiva filtri e ordinamenti prima della correzione OCR.';
  }
  return null;
}
