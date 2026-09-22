/**
 * Parses markdown tables (produced by Mistral OCR or GPT-4o Vision) and maps
 * their columns onto a canonical row schema. This is the replacement for the
 * coordinate-based column reconstruction in `pdfToText.ts`, which was the
 * primary source of the "NR instead of KG" / quantity<>price swaps that users
 * observed in the extracted product list.
 *
 * The output is intentionally schema-agnostic: it just exposes a list of
 * structured rows (`NormalizedTableRow`) plus the original markdown text
 * around the tables. The downstream LLM call then takes both the normalized
 * rows AND the surrounding text to extract invoice/DDT-specific metadata
 * (numero, data, fornitore, ...).
 *
 * Section-header rows ("Rif DT n.XXX del DD/MM/YY"), which some Italian
 * suppliers use inside the product table to group rows by their source DDT,
 * are dropped here: they're document metadata, not products, and leaving
 * them in the structured rows causes downstream off-by-one row shifts when
 * the OCR has merged the header's visual line with the next product's
 * numeric values.
 */

import { isSectionHeaderOnlyDescription, stripSectionHeaderMarkers } from './product-name-rules';

export interface NormalizedTableRow {
  readonly productName: string | null;
  readonly productCode: string | null;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  /** Original raw cells from the table (joined by " | ") for traceability. */
  readonly rawLine: string;
}

export interface NormalizedTable {
  readonly headers: readonly string[];
  readonly rows: readonly NormalizedTableRow[];
}

export interface TableNormalizationResult {
  readonly tables: readonly NormalizedTable[];
  /** Non-table markdown (headers, footers, supplier info) preserved for the LLM. */
  readonly surroundingText: string;
}

type ColumnKey =
  | 'productName'
  | 'productCode'
  | 'quantity'
  | 'quantityUnitOfMeasure'
  | 'unitPrice'
  | 'totalPrice';

const HEADER_ALIASES: Readonly<Record<ColumnKey, readonly string[]>> = {
  productName: [
    'descrizione',
    'descrizione articolo',
    'descrizione prodotto',
    'descripita', // OCR-mangled variant seen on scanned DDTs
    'descriptione',
    'descrzione',
    'prodotto',
    'articolo',
    'articoio', // OCR-mangled (I/O confusion)
    'denominazione',
    'nome',
    'nome prodotto',
    'nome commerciale',
  ],
  productCode: ['codice', 'codice articolo', 'cod', 'cod.', 'cod articolo', 'sku', 'ref'],
  quantity: ['quantita', 'quantità', 'qta', 'qt', 'qty', 'q.ta', 'quant'],
  quantityUnitOfMeasure: ['um', 'u.m.', 'u m', 'unita', 'unita misura', 'u di m', 'misura'],
  unitPrice: [
    'prezzo',
    'prezzo unitario',
    'prezzo u.',
    'prezzo un',
    'pr. unit',
    'pr unit',
    'importo unitario',
    'importo u',
  ],
  totalPrice: ['totale', 'importo', 'importo totale', 'prezzo totale', 'valore'],
};

const MIN_MARKDOWN_COLUMNS = 3;

/**
 * Main entry point. Extracts every markdown table from `text` and returns the
 * normalized rows plus the non-table text around them.
 */
export function normalizeTablesFromMarkdown(text: string): TableNormalizationResult {
  if (!text || text.trim().length === 0) {
    return { tables: [], surroundingText: '' };
  }
  const lines = text.split(/\r?\n/);
  const tables: NormalizedTable[] = [];
  const outsideLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const tableBlock = findTableBlock(lines, i);
    if (!tableBlock) {
      outsideLines.push(lines[i]);
      i += 1;
      continue;
    }
    const normalized = parseTableBlock(tableBlock.lines);
    if (normalized && normalized.rows.length > 0) {
      tables.push(normalized);
    } else {
      outsideLines.push(...tableBlock.lines);
    }
    i = tableBlock.endIndex;
  }
  return { tables, surroundingText: outsideLines.join('\n').trim() };
}

interface TableBlock {
  readonly lines: readonly string[];
  readonly endIndex: number;
}

/**
 * Finds a contiguous block of markdown table lines starting at `startIndex`.
 * A block is considered a table when at least 3 consecutive lines start with
 * `|` and contain at least `MIN_MARKDOWN_COLUMNS` pipe-separated cells.
 */
function findTableBlock(lines: readonly string[], startIndex: number): TableBlock | null {
  if (!isPotentialTableLine(lines[startIndex])) return null;
  let end = startIndex;
  while (end < lines.length && isPotentialTableLine(lines[end])) {
    end += 1;
  }
  const block = lines.slice(startIndex, end);
  if (block.length < 3) return null;
  return { lines: block, endIndex: end };
}

function isPotentialTableLine(line: string | undefined): boolean {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return false;
  const cells = splitRow(trimmed);
  return cells.length >= MIN_MARKDOWN_COLUMNS;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell.length === 0);
}

function isEmptyHeader(cells: readonly string[]): boolean {
  const nonEmpty = cells.filter((cell) => cell.length > 0);
  return nonEmpty.length < 2;
}

/**
 * Parses a raw table block: picks the header row, resolves the column mapping,
 * and extracts one `NormalizedTableRow` per data row.
 *
 * We reject header candidates that contain only empty cells or OCR noise:
 * a separator-looking row (`| --- | --- |`) placed before the real header
 * row would otherwise poison the mapping and drop the entire table.
 */
function parseTableBlock(blockLines: readonly string[]): NormalizedTable | null {
  const dataRows: string[][] = [];
  let headers: string[] | null = null;
  for (const line of blockLines) {
    const cells = splitRow(line);
    if (isSeparatorRow(cells)) continue;
    if (!headers) {
      if (isEmptyHeader(cells)) continue;
      headers = cells;
      continue;
    }
    if (cells.length === 0) continue;
    dataRows.push(cells);
  }
  if (!headers) return null;
  const mapping = resolveColumnMapping(headers);
  if (mapping.productName === undefined && mapping.quantity === undefined) {
    return null;
  }
  const rows = dataRows
    .map((cells) => buildNormalizedRow(cells, mapping))
    .filter((row): row is NormalizedTableRow => row !== null);
  return { headers, rows };
}

type ColumnMapping = Partial<Record<ColumnKey, number>>;

function resolveColumnMapping(headers: readonly string[]): ColumnMapping {
  const normalizedHeaders = headers.map(normalizeHeaderLabel);
  const mapping: ColumnMapping = {};
  (Object.keys(HEADER_ALIASES) as ColumnKey[]).forEach((key) => {
    const aliases = HEADER_ALIASES[key];
    const idx = normalizedHeaders.findIndex((header) =>
      aliases.some((alias) => header === alias || header.startsWith(alias)),
    );
    if (idx >= 0) {
      mapping[key] = idx;
    }
  });
  return mapping;
}

function normalizeHeaderLabel(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildNormalizedRow(
  cells: readonly string[],
  mapping: ColumnMapping,
): NormalizedTableRow | null {
  const productNameIdx = mapping.productName;
  if (productNameIdx === undefined) return null;
  const rawProductName = cells[productNameIdx] ?? '';
  if (!rawProductName || rawProductName.trim().length === 0) return null;
  if (isSectionHeaderOnlyDescription(rawProductName)) return null;
  const cleanedProductName = stripSectionHeaderMarkers(rawProductName);
  if (cleanedProductName.length === 0) return null;
  return {
    productName: cleanedProductName,
    productCode: readCell(cells, mapping.productCode),
    quantity: parseNumber(readCell(cells, mapping.quantity)),
    quantityUnitOfMeasure: readCell(cells, mapping.quantityUnitOfMeasure),
    unitPrice: parseNumber(readCell(cells, mapping.unitPrice)),
    totalPrice: parseNumber(readCell(cells, mapping.totalPrice)),
    rawLine: cells.join(' | '),
  };
}

function readCell(cells: readonly string[], index: number | undefined): string | null {
  if (index === undefined) return null;
  const value = cells[index];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parses a numeric cell. Handles Italian-style decimal commas and thousand dots.
 */
export function parseNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.replace(/\s/g, '').replace(/[€$]/g, '');
  if (!trimmed) return null;
  const hasComma = trimmed.includes(',');
  const normalized = hasComma
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(/(?<=\d)\.(?=\d{3}\b)/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Serializes a normalized table back into a compact JSON payload suitable for
 * inclusion in an LLM prompt. Avoids leaking column-ordering ambiguity: every
 * field is named explicitly.
 */
export function serializeTableForLlm(tables: readonly NormalizedTable[]): string {
  if (tables.length === 0) return '[]';
  const compact = tables.flatMap((table) =>
    table.rows.map((row) => ({
      productName: row.productName,
      productCode: row.productCode,
      quantity: row.quantity,
      quantityUnitOfMeasure: row.quantityUnitOfMeasure,
      unitPrice: row.unitPrice,
      totalPrice: row.totalPrice,
    })),
  );
  return JSON.stringify(compact, null, 0);
}
