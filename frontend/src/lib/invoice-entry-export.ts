import { COLUMNS } from '@/lib/ag-grid/invoice-columns';
import { buildTableExportParams } from '@/lib/table-export';
import type { ExportParams } from '@/lib/export';
import type { ConfirmableStockEntry } from '@/types/extraction';

export function buildInvoiceEntriesExportParams(
  rows: readonly ConfirmableStockEntry[],
  filename: string,
): ExportParams {
  return buildTableExportParams({
    columns: COLUMNS.map((column) => ({
      label: column.label,
      getValue: (row: ConfirmableStockEntry) =>
        (row as unknown as Record<string, string | number | null | undefined>)[column.key] ?? '',
    })),
    rows,
    filename,
  });
}

export function getRowsSelectedBySpreadsheet<TData>(
  rows: readonly TData[],
  selectedCells: ReadonlySet<string>,
): readonly TData[] {
  const selectedRowIndexes = new Set<number>();

  for (const key of selectedCells) {
    const [rowPart] = key.split(':');
    const rowIndex = Number.parseInt(rowPart ?? '', 10);
    if (Number.isInteger(rowIndex)) selectedRowIndexes.add(rowIndex);
  }

  return rows.filter((_, index) => selectedRowIndexes.has(index));
}
