import * as XLSX from 'xlsx';
import { isMetadataRow, looksLikeDataRow } from './header_detector.part-03-extract-metadata';
import { HEADER_INDICATORS, SUB_HEADER_INDICATORS } from './header_detector.part-01-header-indicators';

/**
 * Find the header row(s) in the data
 */
export function findHeaderRows(
  rows: (string | number)[][],
  maxScanRows: number,
  mergedCells?: XLSX.Range[],
): { startRow: number; rowCount: number } {
  // First, check if this looks like AVEPA "Piano Utilizzo" format
  // which has headers starting around row 21-22 (0-indexed)
  const isAvepaFormat = rows.slice(0, 10).some((row) => {
    const rowText = row.map((c) => String(c || '').toLowerCase()).join(' ');
    return rowText.includes('piano utilizzo') || rowText.includes('avepa');
  });

  // For AVEPA format, scan a wider range starting from row 15
  const scanStart = isAvepaFormat ? 15 : 0;
  const scanLimit = isAvepaFormat ? Math.min(35, rows.length) : Math.min(maxScanRows, rows.length);

  for (let i = scanStart; i < scanLimit; i++) {
    const row = rows[i];
    if (!row) continue;

    // Skip rows that look like metadata (e.g., "Cuaa: 12345")
    if (isMetadataRow(row)) continue;

    // Skip rows with very few non-empty cells (likely empty or metadata)
    const nonEmptyCells = row.filter((c) => c !== '' && c !== null && c !== undefined);
    if (nonEmptyCells.length < 3) continue;

    const rowText = row
      .map((c) => String(c || '').toLowerCase())
      .join(' ')
      .replace(/\r?\n/g, ' ');

    // Check if this row contains header indicators
    const hasHeaderIndicator = HEADER_INDICATORS.some(
      (indicator) =>
        rowText.includes(indicator) ||
        row.some((c) =>
          String(c || '')
            .toLowerCase()
            .replace(/\r?\n/g, ' ')
            .includes(indicator),
        ),
    );

    if (hasHeaderIndicator) {
      // For CSV files without merged cells, be conservative - use 1 row header by default
      // Only look for multi-row headers in Excel files with merged cells
      let headerRowCount = 1;

      // Check the next row - if it looks like data, don't combine headers
      const nextRow = rows[i + 1];
      if (nextRow && looksLikeDataRow(nextRow)) {
        // Next row is data, so this is a single-row header
        return { startRow: i, rowCount: 1 };
      }

      // Only expand header rows for Excel files with merged cells
      if (mergedCells && mergedCells.length > 0) {
        // Look at next rows for sub-header indicators
        for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
          const subRow = rows[j];
          if (!subRow) continue;

          // If this row looks like data, stop looking for more headers
          if (looksLikeDataRow(subRow)) {
            break;
          }

          const subRowText = subRow
            .map((c) => String(c || '').toLowerCase())
            .join(' ')
            .replace(/\r?\n/g, ' ');

          // Check if this is a sub-header row
          const hasSubHeaderIndicator = SUB_HEADER_INDICATORS.some(
            (indicator) =>
              subRowText.includes(indicator) ||
              subRow.some((c) =>
                String(c || '')
                  .toLowerCase()
                  .replace(/\r?\n/g, ' ')
                  .includes(indicator),
              ),
          );

          // Check if row is mostly empty (merged cells continuation)
          const nonEmptyCount = subRow.filter(
            (c) => c !== '' && c !== null && c !== undefined,
          ).length;
          const isMostlyEmpty = nonEmptyCount < row.filter((c) => c !== '').length / 2;

          if (hasSubHeaderIndicator || (isMostlyEmpty && j < i + 4)) {
            headerRowCount = j - i + 1;
          } else if (!isMostlyEmpty) {
            break;
          }
        }

        // Check merged cells for header span
        const headerMerges = mergedCells.filter((m) => m.s.r >= i && m.s.r < i + 10);
        const maxEndRow = Math.max(...headerMerges.map((m) => m.e.r), i);
        if (maxEndRow > i) {
          headerRowCount = Math.max(headerRowCount, maxEndRow - i + 1);
        }
      }

      return { startRow: i, rowCount: headerRowCount };
    }
  }

  // Fallback: assume first row is header
  return { startRow: 0, rowCount: 1 };
}

/**
 * Combine multiple header rows into a single header array
 */
export function combineMultiRowHeaders(
  headerRows: (string | number)[][],
  mergedCells?: XLSX.Range[],
  startRowOffset: number = 0,
): string[] {
  if (headerRows.length === 0) return [];
  if (headerRows.length === 1) return headerRows[0].map((c) => String(c || ''));

  // Find max column count
  const maxCols = Math.max(...headerRows.map((r) => r.length));
  const combined: string[] = new Array(maxCols).fill('');

  // Build merged cell map for quick lookup
  const mergeMap = new Map<string, { value: string; endCol: number }>();
  if (mergedCells) {
    for (const merge of mergedCells) {
      if (merge.s.r >= startRowOffset && merge.s.r < startRowOffset + headerRows.length) {
        const relRow = merge.s.r - startRowOffset;
        const value = String(headerRows[relRow]?.[merge.s.c] || '');
        if (value) {
          for (let c = merge.s.c; c <= merge.e.c; c++) {
            mergeMap.set(`${relRow}-${c}`, { value, endCol: merge.e.c });
          }
        }
      }
    }
  }

  // Process each column
  for (let col = 0; col < maxCols; col++) {
    const parts: string[] = [];

    for (let row = 0; row < headerRows.length; row++) {
      let cellValue = String(headerRows[row]?.[col] || '').trim();

      // Check for merged cell value
      const mergeInfo = mergeMap.get(`${row}-${col}`);
      if (mergeInfo && !cellValue) {
        cellValue = mergeInfo.value;
      }

      if (cellValue && cellValue !== '-') {
        // Clean up newlines
        cellValue = cellValue.replace(/\r?\n/g, ' ').trim();

        // Avoid duplicating category names in sub-columns
        if (!parts.some((p) => p.toLowerCase() === cellValue.toLowerCase())) {
          parts.push(cellValue);
        }
      }
    }

    combined[col] = parts.join(' ').trim();
  }

  return combined;
}
