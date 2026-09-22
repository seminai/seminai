/**
 * Shared CSV/Excel parsing utilities used by both FieldCsvAgent and ProductionUnitCsvAgent.
 *
 * Centralizes: file conversion, CSV parsing, number/date handling, column validation,
 * and extraction diagnostics.
 */

import * as XLSX from 'xlsx';

/**
 * Parsed row from CSV with normalized values
 */
export interface ParsedRow {
  [key: string]: string;
}

/**
 * Diagnostics collected during extraction to inform the user about data quality
 */
export interface ExtractionDiagnostics {
  totalRows: number;
  extractedRows: number;
  detectedFormat: string;
  skippedRows: { reason: string; count: number }[];
  warnings: string[];
}

/**
 * Helper to accumulate skip reasons during extraction
 */
export class SkipCounter {
  private counts = new Map<string, number>();

  increment(reason: string): void {
    this.counts.set(reason, (this.counts.get(reason) || 0) + 1);
  }

  toArray(): { reason: string; count: number }[] {
    return Array.from(this.counts.entries())
      .filter(([, count]) => count > 0)
      .map(([reason, count]) => ({ reason, count }));
  }

  get total(): number {
    let sum = 0;
    for (const count of this.counts.values()) {
      sum += count;
    }
    return sum;
  }
}

/**
 * Create an initial ExtractionDiagnostics object
 */
export function createDiagnostics(
  totalRows: number,
  detectedFormat: string,
): ExtractionDiagnostics {
  return {
    totalRows,
    extractedRows: 0,
    detectedFormat,
    skippedRows: [],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// File conversion
// ---------------------------------------------------------------------------

/**
 * Check if buffer is an Excel file (xlsx or xls)
 */
export function isExcelFile(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  // XLSX files start with ZIP magic bytes (PK)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return true;
  }

  // XLS files start with BIFF magic bytes
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return true;
  }

  return false;
}

/**
 * Convert buffer to CSV string, handling Excel files
 */
export function bufferToCsv(buffer: Buffer): string {
  if (isExcelFile(buffer)) {
    try {
      const workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: true,
        dateNF: 'dd/mm/yyyy',
      });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (firstSheet) {
        return XLSX.utils.sheet_to_csv(firstSheet, { FS: ';', dateNF: 'dd/mm/yyyy' });
      }
    } catch {
      // Fall through to CSV parsing
    }
  }

  let content = buffer.toString('utf-8');
  // Normalize line endings
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return content;
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Detect CSV separator from first line
 */
export function detectSeparator(line: string): string {
  const separators = [';', ',', '\t', '|'];
  const counts = separators.map((sep) => ({
    sep,
    count: (line.match(new RegExp(sep.replace(/[|]/g, '\\$&'), 'g')) || []).length,
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0]?.sep ?? ';';
}

/**
 * Parse a single CSV line handling quoted fields
 */
export function parseCsvLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (!inQuotes) {
        inQuotes = true;
      } else if (nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
    i++;
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse CSV content into headers and rows
 */
export function parseCsv(content: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const separator = detectSeparator(lines[0]);
  const headers = parseCsvLine(lines[0], separator);

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], separator);
    if (values.length === 0 || values.every((v) => !v.trim())) {
      continue;
    }
    const row: ParsedRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

/**
 * Get value from row by column name (null-safe)
 */
export function getValue(row: ParsedRow, colName: string | null): string | null {
  if (!colName) return null;
  const val = row[colName];
  return val?.trim() || null;
}

/**
 * Parse number from string, correctly handling Italian format (dot as thousands, comma as decimal).
 * Examples: "1.234,56" → 1234.56 | "6,5700" → 6.57 | "42" → 42
 */
export function parseNumber(value: string | null): number | null {
  if (!value) return null;

  // Remove dots used as thousands separators, then replace comma with dot for decimal
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalized);
  return Number.isNaN(num) ? null : num;
}

/**
 * Parse date from various formats to ISO YYYY-MM-DD
 */
export function parseDate(value: string | null): string | null {
  if (!value) return null;

  // Try dd/mm/yyyy format
  const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // Try dd-mm-yyyy format
  const ddmmyyyyDash = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyDash) {
    const day = ddmmyyyyDash[1].padStart(2, '0');
    const month = ddmmyyyyDash[2].padStart(2, '0');
    const year = ddmmyyyyDash[3];
    return `${year}-${month}-${day}`;
  }

  // Try yyyy-mm-dd format
  const yyyymmdd = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Try Date parsing as fallback
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Normalize string for comparison/aggregation
 */
export function normalizeString(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Clean bracket value like "[000] -" → null, "[003] SOMETHING" → "SOMETHING"
 */
export function cleanBracketValue(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^\[\d+\]\s*(.*)$/);
  if (match) {
    const inner = match[1].trim();
    if (inner === '-' || inner === '' || inner === '0') {
      return null;
    }
    return inner;
  }
  return value.trim() || null;
}

/**
 * Parse occupation string like "[003] COLZA" into code and name
 */
export function parseOccupazione(value: string): { code: string | null; name: string | null } {
  const match = value.match(/^\[(\d+)\]\s*(.*)$/);
  if (match) {
    return { code: match[1], name: match[2].trim() || null };
  }
  return { code: null, name: value.trim() || null };
}

// ---------------------------------------------------------------------------
// Column mapping validation (fuzzy match)
// ---------------------------------------------------------------------------

/**
 * Levenshtein distance between two strings (case-insensitive)
 */
function levenshteinDistance(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const matrix: number[][] = [];

  for (let i = 0; i <= al.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bl.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= al.length; i++) {
    for (let j = 1; j <= bl.length; j++) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[al.length][bl.length];
}

/**
 * Find the closest matching header name for a given column name.
 * Returns null if no reasonable match is found.
 */
function findClosestHeader(colName: string, headers: string[]): string | null {
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  // Max threshold: scale with string length but cap at 5
  const maxDistance = Math.min(5, Math.max(2, Math.floor(colName.length * 0.3)));

  for (const header of headers) {
    const dist = levenshteinDistance(colName, header);
    if (dist < bestDistance && dist <= maxDistance) {
      bestDistance = dist;
      bestMatch = header;
    }
  }

  return bestMatch;
}

/**
 * Validate that LLM-returned column names actually exist in the CSV headers.
 * Attempts fuzzy matching for close misses.
 *
 * @param columns  - Record where keys are semantic names and values are CSV column names (or null)
 * @param headers  - Actual CSV header names
 * @returns fixed columns record and list of warnings
 */
export function validateColumnMapping<T extends Record<string, string | null>>(
  columns: T,
  headers: string[],
): { columns: T; warnings: string[] } {
  const warnings: string[] = [];
  const headerSet = new Set(headers);
  const fixed = { ...columns };

  for (const [key, colName] of Object.entries(fixed)) {
    if (colName && !headerSet.has(colName)) {
      const bestMatch = findClosestHeader(colName, headers);
      if (bestMatch) {
        (fixed as Record<string, string | null>)[key] = bestMatch;
        warnings.push(`Colonna "${colName}" corretta in "${bestMatch}" (fuzzy match)`);
      } else {
        (fixed as Record<string, string | null>)[key] = null;
        warnings.push(`Colonna "${colName}" non trovata nel file (campo: ${key})`);
      }
    }
  }

  return { columns: fixed, warnings };
}

// ---------------------------------------------------------------------------
// LLM invocation with retry
// ---------------------------------------------------------------------------

/**
 * Invoke an LLM extractor with retry and timeout.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function invokeLLMWithRetry<T>(
  invoker: (msgs: any, opts?: any) => Promise<T>,
  messages: any,
  invokeOptions?: Record<string, any>,
  retryOptions: { maxRetries?: number; timeoutMs?: number } = {},
): Promise<T> {
  const { maxRetries = 2, timeoutMs = 30_000 } = retryOptions;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        invokeOptions ? invoker(messages, invokeOptions) : invoker(messages),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), timeoutMs),
        ),
      ]);
      return result;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = 1000 * (attempt + 1);
      console.warn(
        `[CSV-PARSER] LLM attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
        error instanceof Error ? error.message : String(error),
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Unreachable – the loop always either returns or rethrows
  throw new Error('LLM invocation failed after retries');
}
