/**
 * Schema-aware deterministic fallback.
 *
 * Replaces the old regex-based fallbacks that assumed a fixed 3-column layout
 * (product | UM | quantity). Instead, it consumes `NormalizedTable` objects
 * produced by `TableNormalizer` — which resolved header aliases to canonical
 * keys — and returns structured rows regardless of the original column order.
 *
 * Two thin adapters (`invoice-deterministic-fallback-parser.ts` and
 * `ddt-deterministic-fallback-parser.ts`) wrap this core to produce the
 * invoice- or DDT-specific DTO shapes.
 */

import { normalizeTablesFromMarkdown, type NormalizedTableRow } from './table-normalizer';
import { normalizeProductName } from './product-name-rules';

export interface DeterministicRow {
  readonly productName: string;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  readonly sourceRowIndex: number;
  readonly productCode: string | null;
  readonly rawLine: string;
}

/**
 * Parses all markdown tables found in `text` and returns the deterministic
 * product rows. Rows without a usable product name are dropped silently.
 */
export function extractDeterministicRows(text: string): ReadonlyArray<DeterministicRow> {
  const { tables } = normalizeTablesFromMarkdown(text);
  const rows: DeterministicRow[] = [];
  let sourceRowIndex = 0;
  for (const table of tables) {
    for (const normalizedRow of table.rows) {
      const deterministicRow = buildDeterministicRow(normalizedRow, sourceRowIndex);
      sourceRowIndex += 1;
      if (deterministicRow) rows.push(deterministicRow);
    }
  }
  return deduplicate(rows);
}

function buildDeterministicRow(
  row: NormalizedTableRow,
  sourceRowIndex: number,
): DeterministicRow | null {
  const productName = normalizeProductName(row.productName ?? '');
  if (!productName) return null;
  return {
    productName,
    quantity: row.quantity,
    quantityUnitOfMeasure: row.quantityUnitOfMeasure?.toUpperCase().replace(/\./g, '') ?? null,
    unitPrice: row.unitPrice,
    totalPrice: row.totalPrice,
    sourceRowIndex,
    productCode: row.productCode,
    rawLine: row.rawLine,
  };
}

function deduplicate(rows: readonly DeterministicRow[]): DeterministicRow[] {
  const seen = new Map<string, DeterministicRow>();
  for (const row of rows) {
    const key = [
      row.productName.toLowerCase(),
      row.quantity ?? '',
      row.quantityUnitOfMeasure ?? '',
      row.unitPrice ?? '',
      row.totalPrice ?? '',
    ].join('|');
    if (!seen.has(key)) seen.set(key, row);
  }
  return Array.from(seen.values());
}
