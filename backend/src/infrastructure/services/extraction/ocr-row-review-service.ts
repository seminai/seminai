import { type ExtractionChannel } from './extraction-telemetry';
import { type NormalizedTable, type NormalizedTableRow } from './table-normalizer';
import { withReviewReasons } from './review-reasons';

interface ReviewEntry {
  readonly productName: string;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly unitPrice?: number | null;
  readonly totalPrice?: number | null;
  readonly needsReview?: boolean;
  readonly reviewReasons?: readonly string[];
}

interface ReviewInput<T extends ReviewEntry> {
  readonly entries: readonly T[];
  readonly tables: readonly NormalizedTable[];
  readonly channel: ExtractionChannel;
}

interface SourceRow {
  readonly index: number;
  readonly row: NormalizedTableRow;
}

type ReviewSourceChannel = 'llm-primary' | 'deterministic-fallback' | 'xml';

/**
 * Attaches OCR provenance and flags likely row-shift issues.
 */
export class OcrRowReviewService {
  static apply<T extends ReviewEntry>(input: ReviewInput<T>): readonly T[] {
    const sourceRows = flattenRows(input.tables);
    const countReason = buildCountReason(input.entries.length, sourceRows.length, input.channel);
    const usedIndexes = new Set<number>();
    return input.entries.map((entry, index) => {
      const source = findSourceRow(entry, sourceRows, usedIndexes);
      if (source) usedIndexes.add(source.index);
      const reasons = [...countReason, ...buildSourceReasons(entry, source?.row)];
      const withSource = attachSource(entry, source, input.channel, index);
      return withReviewReasons(withSource, reasons);
    });
  }
}

function flattenRows(tables: readonly NormalizedTable[]): readonly SourceRow[] {
  let index = 0;
  return tables.flatMap((table) =>
    table.rows.map((row) => {
      const source = { index, row };
      index += 1;
      return source;
    }),
  );
}

function buildCountReason(
  entryCount: number,
  sourceCount: number,
  channel: ExtractionChannel,
): readonly string[] {
  if (channel !== 'llm-primary' || sourceCount === 0) return [];
  const diff = Math.abs(entryCount - sourceCount);
  const threshold = Math.max(2, Math.ceil(sourceCount * 0.2));
  if (diff < threshold) return [];
  return [`LLM row count differs from OCR table rows (${entryCount} vs ${sourceCount})`];
}

function findSourceRow<T extends ReviewEntry>(
  entry: T,
  sourceRows: readonly SourceRow[],
  usedIndexes: ReadonlySet<number>,
): SourceRow | null {
  return (
    sourceRows.find(
      (source) => !usedIndexes.has(source.index) && matchesNumericFields(entry, source.row),
    ) ?? null
  );
}

function matchesNumericFields(entry: ReviewEntry, row: NormalizedTableRow): boolean {
  const quantityMatches = numbersMatch(entry.quantity, row.quantity);
  const unitMatches =
    normalizeUnit(entry.quantityUnitOfMeasure) === normalizeUnit(row.quantityUnitOfMeasure);
  const unitPriceMatches = nullableNumbersMatch(entry.unitPrice ?? null, row.unitPrice);
  const totalPriceMatches = nullableNumbersMatch(entry.totalPrice ?? null, row.totalPrice);
  return quantityMatches && unitMatches && unitPriceMatches && totalPriceMatches;
}

function attachSource<T extends ReviewEntry>(
  entry: T,
  source: SourceRow | null,
  channel: ExtractionChannel,
  fallbackIndex: number,
): T {
  return {
    ...entry,
    sourceRowIndex: source?.index ?? fallbackIndex,
    productCode: source?.row.productCode ?? null,
    rawLine: source?.row.rawLine,
    sourceChannel: toReviewSourceChannel(channel),
  };
}

function toReviewSourceChannel(channel: ExtractionChannel): ReviewSourceChannel {
  return channel === 'fattura-pa-xml' ? 'xml' : channel;
}

function buildSourceReasons(
  entry: ReviewEntry,
  row: NormalizedTableRow | undefined,
): readonly string[] {
  if (!row?.productCode) return [];
  const prefix = extractMeaningfulCodePrefix(row.productCode);
  if (!prefix) return [];
  const normalizedName = entry.productName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalizedName.includes(prefix)) return [];
  return [`Product code/name mismatch: ${row.productCode} vs ${entry.productName}`];
}

function extractMeaningfulCodePrefix(productCode: string): string | null {
  const match = productCode.toUpperCase().match(/^X([A-Z]{3})/);
  return match?.[1] ?? null;
}

function nullableNumbersMatch(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return true;
  return numbersMatch(left, right);
}

function numbersMatch(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 0.0001;
}

function normalizeUnit(unit: string | null): string {
  return unit?.replace(/\./g, '').trim().toUpperCase() ?? '';
}
