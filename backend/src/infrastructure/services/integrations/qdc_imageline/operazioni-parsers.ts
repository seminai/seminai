/**
 * Column-name-based parsers for QDC recordsets.
 *
 * QDC recordsets are positional arrays and the key casing varies by endpoint
 * (`COLUMNS`/`DATA` vs `columns`/`data` — see QdcTableResult). Resolving cells
 * by column name keeps consumers resilient to both the casing split and column
 * reordering across API versions.
 */

import type { QdcCellValue, QdcTableResult } from './types';

export type { QdcCellValue } from './types';

export type QdcRecord = Readonly<Record<string, QdcCellValue>>;

/** Maps upper-cased column names to their index in the recordset columns. */
export function buildColumnIndexMap(columns: readonly string[]): ReadonlyMap<string, number> {
  return new Map(columns.map((column, index) => [column.toUpperCase(), index]));
}

/**
 * Converts a QDC recordset (either key casing) into an array of records keyed
 * by column name. Returns an empty array when the recordset is missing or
 * malformed.
 */
export function parseTableToRecords(result: QdcTableResult | undefined): QdcRecord[] {
  const columns = result?.COLUMNS ?? result?.columns;
  const data = result?.DATA ?? result?.data;
  if (!columns || !data) {
    return [];
  }
  return data.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])),
  );
}
