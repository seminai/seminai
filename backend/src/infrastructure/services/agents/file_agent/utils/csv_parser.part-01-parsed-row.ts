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
