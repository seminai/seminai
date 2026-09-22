import type { ExportParams } from '@/lib/export';

export interface TableExportColumn<TData> {
  readonly label: string;
  readonly getValue: (row: TData) => unknown;
}

interface BuildTableExportParamsOptions<TData> {
  readonly columns: readonly TableExportColumn<TData>[];
  readonly rows: readonly TData[];
  readonly filename: string;
}

export function buildTableExportParams<TData>({
  columns,
  rows,
  filename,
}: BuildTableExportParamsOptions<TData>): ExportParams {
  return {
    headers: columns.map((column) => column.label),
    rows: rows.map((row) => columns.map((column) => stringifyCell(column.getValue(row)))),
    filename,
  };
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
