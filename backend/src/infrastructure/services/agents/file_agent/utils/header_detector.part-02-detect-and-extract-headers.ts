import * as XLSX from 'xlsx';
import { HeaderDetectionResult } from './header_detector.part-01-header-indicators';
import { extractMetadata } from './header_detector.part-03-extract-metadata';
import { combineMultiRowHeaders, findHeaderRows } from './header_detector.part-04-find-header-rows';
import { normalizeHeaders } from './header_detector.part-05-normalize-headers';
import { detectFormat, isEmptyRow } from './header_detector.part-06-detect-format';

/**
 * Detect and extract headers from an Excel/CSV buffer
 * Handles multi-row headers and offset header positions
 */
export function detectAndExtractHeaders(
  buffer: Buffer,
  options?: { maxScanRows?: number },
): HeaderDetectionResult {
  const maxScanRows = options?.maxScanRows ?? 20;

  // Try to parse as Excel first
  const isExcel = isExcelBuffer(buffer);
  let rawData: string[][];
  let mergedCells: XLSX.Range[] | undefined;

  if (isExcel) {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      dateNF: 'dd/mm/yyyy',
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];
    mergedCells = sheet['!merges'];
  } else {
    rawData = parseCSVToRows(buffer.toString('utf-8'));
  }

  if (rawData.length === 0) {
    return {
      headers: [],
      dataStartRow: 0,
      headerStartRow: 0,
      headerRowCount: 0,
      detectedFormat: 'unknown',
      rawRows: [],
      metadata: {},
    };
  }

  // Extract metadata from early rows
  const metadata = extractMetadata(rawData.slice(0, maxScanRows));

  // Find header row(s)
  const headerInfo = findHeaderRows(rawData, maxScanRows, mergedCells);

  // Combine multi-row headers
  const combinedHeaders = combineMultiRowHeaders(
    rawData.slice(headerInfo.startRow, headerInfo.startRow + headerInfo.rowCount),
    mergedCells,
    headerInfo.startRow,
  );

  // Normalize header names
  const normalizedHeaders = normalizeHeaders(combinedHeaders);

  // Detect format
  const detectedFormat = detectFormat(normalizedHeaders);

  // Extract data rows (skip empty rows immediately after headers)
  let dataStartRow = headerInfo.startRow + headerInfo.rowCount;
  while (
    dataStartRow < rawData.length &&
    isEmptyRow(rawData[dataStartRow] as (string | number)[])
  ) {
    dataStartRow++;
  }

  return {
    headers: normalizedHeaders,
    dataStartRow,
    headerStartRow: headerInfo.startRow,
    headerRowCount: headerInfo.rowCount,
    detectedFormat,
    rawRows: rawData.slice(dataStartRow) as string[][],
    metadata,
  };
}

/**
 * Check if buffer is an Excel file
 */
export function isExcelBuffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // XLSX (ZIP)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return true;
  // XLS (BIFF)
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0)
    return true;
  return false;
}

/**
 * Parse CSV content into rows
 */
export function parseCSVToRows(content: string): string[][] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const separator = detectSeparator(lines[0] || '');

  return lines.map((line) => parseCsvLine(line, separator));
}

/**
 * Detect CSV separator
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
