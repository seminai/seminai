/**
 * Header Detector Utility
 *
 * Detects and normalizes CSV/Excel headers that may be:
 * - Offset (not starting at row 1)
 * - Split across multiple rows (merged cells)
 * - Using abbreviated column names
 *
 * Maps detected headers to known regional templates (Piemonte, Lombardia, Emilia-Romagna)
 */

import * as XLSX from 'xlsx';

/**
 * Known header patterns that indicate the start of a header row
 * These are distinctive enough to identify header rows vs metadata rows
 * NOTE: These patterns must appear in actual header context, not as metadata labels
 */
const HEADER_INDICATORS = [
  // Piemonte format - specific patterns
  'unita produttiva',
  "unita' produttiva",
  'identificativo catastale',
  'occupazione suolo uso suolo primario',
  'uso del suolo primario',
  // Lombardia format - but not 'cuaa' alone (it appears in metadata)
  'supero',
  'tipo utilizzo',
  'coltivazione',
  'sez cens',
  'mappale',
  // Emilia-Romagna format
  'id. domanda',
  'occupazione suolo',
  // Common across formats - but need context (multiple columns)
  'superficie catastale',
  'superficie grafica',
  // Veneto AVEPA "Piano Utilizzo" format
  'sup. catastale',
  '1a coltura',
  'sup. utilizzata',
  'parcella di rif',
  'potenz. irriguo',
  // CIA Schedario Viticolo format
  'descrizione vitigno',
  'forma allevamento',
  'sup. vitata dichiarata',
  'codice vitigno',
  'numero ceppi',
];

/**
 * Known sub-header patterns that indicate continuation of a multi-row header
 */
const SUB_HEADER_INDICATORS = [
  'istat',
  'descrizione',
  'sz.',
  'fgl.',
  'part.',
  'sub.',
  't.c.',
  'occ. suolo',
  'destinazione',
  'uso',
  "qualita'",
  "varieta'",
  'epoca',
  'tipo',
  'data inizio',
  'data fine',
];

/**
 * Column name mappings from abbreviated/variant names to standard names
 */
const COLUMN_NAME_MAPPINGS: Record<string, string> = {
  // Piemonte abbreviations (standalone)
  "unita'\nproduttiva": 'Unita produttiva',
  "unita'\r\nproduttiva": 'Unita produttiva',
  "unita' produttiva": 'Unita produttiva',
  'sz.': 'Sezione',
  'fgl.': 'Foglio',
  'part.': 'Particella',
  'sub.': 'Subalterno',
  // Piemonte combined headers (identificativo catastale + sub-header)
  'identificativo catastale comune istat': 'Comune Istat',
  'identificativo catastale comune descrizione': 'Comune Descrizione',
  'identificativo catastale sz.': 'Sezione',
  'identificativo catastale fgl.': 'Foglio',
  'identificativo catastale part.': 'Particella',
  'identificativo catastale sub.': 'Subalterno',
  'sup.\ncat.': 'Superficie Catastale',
  'sup.\r\ncat.': 'Superficie Catastale',
  'sup. cat.': 'Superficie Catastale',
  'sup.\ngraf.': 'Superficie Grafica',
  'sup.\r\ngraf.': 'Superficie Grafica',
  'sup. graf.': 'Superficie Grafica',
  'sup.\nagr.': 'Superficie Agricola',
  'sup.\r\nagr.': 'Superficie Agricola',
  'sup. agr.': 'Superficie Agricola',
  'sup.\neleg.': 'Superficie Eleggibile',
  'sup.\r\neleg.': 'Superficie Eleggibile',
  'sup. eleg.': 'Superficie Eleggibile',
  'sup.\neleg.\nnetta': 'Superficie Eleggibile Netta',
  'sup.\r\neleg.\r\nnetta': 'Superficie Eleggibile Netta',
  'sup. eleg. netta': 'Superficie Eleggibile Netta',
  't.c.': 'Conduzione TC',
  'conduzione t.c.': 'Conduzione TC',
  '%': 'Conduzione Percent',
  'conduzione %': 'Conduzione Percent',
  'c.p.': 'CP',
  'irr.': 'Irr',
  'occ. suolo': 'Occupazione Suolo',
  "qualita'": 'Qualita',
  "varieta'": 'Varieta',
  'sup.': 'Superficie',
  'sup.\nnetta': 'Superficie Netta',
  'sup.\r\nnetta': 'Superficie Netta',
  'data inizio': 'Data inizio',
  'data fine': 'Data fine',
  'zona\nalt.': 'Zona Alt',
  'zona\r\nalt.': 'Zona Alt',
  "potenzialita'\nirrigua": 'Potenzialita irrigua',
  "potenzialita'\r\nirrigua": 'Potenzialita irrigua',
  'rotazione\ncolturale': 'Rotazione colturale',
  'rotazione\r\ncolturale': 'Rotazione colturale',
  'num.\npiante': 'Num piante',
  'num.\r\npiante': 'Num piante',
  'in\nconver.': 'In conversione',
  'in\r\nconver.': 'In conversione',
  'd.i.': 'Deroga iniziale',
  'd.f.': 'Deroga finale',
  bio: 'Bio Biologico',
  'conv.': 'Convenzionale Biologico',
  'az. cond. asservimento': 'Az cond asservimento',
  'zvn vigenti': 'Zona Vulnerabile Nitrati vigenti',
  "unita' di misura": 'Unita di misura',
  // Comune variants
  'comune istat': 'Comune Istat',
  'comune descrizione': 'Comune Descrizione',
  istat: 'Comune Istat',
  descrizione: 'Comune Descrizione',
};

/**
 * Result of header detection
 */
export interface HeaderDetectionResult {
  /** Normalized headers */
  headers: string[];
  /** Row index where data starts (0-based) */
  dataStartRow: number;
  /** Row index where headers start (0-based) */
  headerStartRow: number;
  /** Number of header rows detected */
  headerRowCount: number;
  /** Detected format type */
  detectedFormat:
    | 'piemonte'
    | 'lombardia'
    | 'emilia_romagna'
    | 'veneto'
    | 'veneto_avepa'
    | 'cia_schedario_viticolo'
    | 'unknown';
  /** Raw data rows (excluding headers and metadata) */
  rawRows: string[][];
  /** Metadata extracted from file (e.g., CUAA, Denominazione) */
  metadata: Record<string, string>;
}

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
function isExcelBuffer(buffer: Buffer): boolean {
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
function parseCSVToRows(content: string): string[][] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const separator = detectSeparator(lines[0] || '');

  return lines.map((line) => parseCsvLine(line, separator));
}

/**
 * Detect CSV separator
 */
function detectSeparator(line: string): string {
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
function parseCsvLine(line: string, separator: string): string[] {
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
 * Extract metadata from early rows (CUAA, Denominazione, etc.)
 */
function extractMetadata(rows: (string | number)[][]): Record<string, string> {
  const metadata: Record<string, string> = {};

  for (const row of rows) {
    if (!row || row.length < 2) continue;

    const firstCell = String(row[0] || '')
      .toLowerCase()
      .trim();
    const secondCell = String(row[1] || '').trim();
    const rowText = row
      .map((c) => String(c || ''))
      .join(' ')
      .toLowerCase();

    if (firstCell.includes('cuaa') && secondCell) {
      metadata.cuaa = secondCell;
    } else if (firstCell.includes('denominazione') && secondCell) {
      metadata.denominazione = secondCell;
    } else if (firstCell.includes('ragione sociale') && secondCell) {
      metadata.ragioneSociale = secondCell;
    }

    // AVEPA Piano Utilizzo specific metadata
    if (rowText.includes('piano utilizzo')) {
      metadata.formatType = 'piano_utilizzo_avepa';
    }
    if (rowText.includes('campagna')) {
      const yearMatch = rowText.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        metadata.campagna = yearMatch[1];
      }
    }
    if (rowText.includes('stato')) {
      // Extract stato value - look for common values
      if (rowText.includes('in lavorazione')) {
        metadata.stato = 'IN LAVORAZIONE';
      } else if (rowText.includes('confermato')) {
        metadata.stato = 'CONFERMATO';
      } else if (rowText.includes('definitivo')) {
        metadata.stato = 'DEFINITIVO';
      }
    }
  }

  return metadata;
}

/**
 * Check if a row looks like a metadata row (e.g., "Cuaa: 12345", "Denominazione: Company Name")
 * Metadata rows typically have 1-2 non-empty cells with the first being a label ending in ":"
 */
function isMetadataRow(row: (string | number)[]): boolean {
  if (!row) return false;

  const nonEmptyCells = row.filter((c) => c !== '' && c !== null && c !== undefined);

  // Metadata rows typically have very few non-empty cells (1-3)
  if (nonEmptyCells.length > 5) return false;

  // Check if first cell looks like a label (ends with ":" or contains ":")
  const firstCell = String(row[0] || '').trim();
  if (firstCell.endsWith(':') || firstCell.toLowerCase().includes('cuaa:')) {
    return true;
  }

  return false;
}

/**
 * Check if a row looks like a data row (contains numeric values, dates, codes)
 * Data rows typically have numeric values, dates, or specific patterns
 */
function looksLikeDataRow(row: (string | number)[]): boolean {
  if (!row) return false;

  let numericCount = 0;
  let dateCount = 0;
  let codeCount = 0;

  for (const cell of row) {
    const value = String(cell || '').trim();
    if (!value) continue;

    // Check for numeric values with comma decimal separator (e.g., "6,5700", "0,09")
    if (/^\d+[,\.]\d+$/.test(value) || /^\d{1,6}$/.test(value)) {
      numericCount++;
    }

    // Check for dates (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(value) || /^\d{4}-\d{2}-\d{2}/.test(value)) {
      dateCount++;
    }

    // Check for codes like "[780] USO NON AGRICOLO", "[003] COLZA"
    if (/^\[\d+\]/.test(value)) {
      codeCount++;
    }

    // Check for city codes like "6138" or ISTAT codes
    if (/^\d{4,6}$/.test(value)) {
      numericCount++;
    }
  }

  // If the row has multiple numeric values, dates, or codes, it's likely data
  return numericCount >= 2 || dateCount >= 1 || codeCount >= 1;
}

/**
 * Find the header row(s) in the data
 */
function findHeaderRows(
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
function combineMultiRowHeaders(
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

/**
 * Normalize header names to match template format
 */
function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h, index) => {
    const normalized = h.toLowerCase().trim().replace(/\s+/g, ' ');

    // Check direct mapping ONLY for exact matches
    if (COLUMN_NAME_MAPPINGS[normalized]) {
      return COLUMN_NAME_MAPPINGS[normalized];
    }

    // Handle Piemonte format specific combinations FIRST
    // These are more specific and should take precedence over partial matches
    // "Uso del suolo primario Occ. suolo" -> "Occupazione Suolo Uso Suolo Primario"
    const lower = h.toLowerCase();

    // Check for "uso del suolo primario" combined with sub-headers
    if (lower.includes('uso del suolo primario') || lower.includes('suolo primario')) {
      if (lower.includes('occ.') || lower.includes('occ ')) {
        return 'Occupazione Suolo Uso Suolo Primario';
      }
      if (lower.includes('destinazione')) {
        return 'Destinazione Uso Suolo Primario';
      }
      if (lower.includes('qualita')) {
        return 'Qualita Uso Suolo Primario';
      }
      if (lower.includes('varieta')) {
        return 'Varieta Uso Suolo Primario';
      }
      if (lower.includes('netta')) {
        return 'Superficie Netta Uso Suolo Primario';
      }
      if (lower.includes('sup.') || lower.includes('superficie')) {
        return 'Superficie Uso Suolo Primario';
      }
    }

    // Check for "uso del suolo secondario" combined with sub-headers
    if (lower.includes('uso del suolo secondario') || lower.includes('suolo secondario')) {
      if (lower.includes('occ.') || lower.includes('occ ')) {
        return 'Occupazione suolo Uso Suolo Secondario';
      }
      if (lower.includes('destinazione')) {
        return 'Destinazione Uso Suolo Secondario';
      }
      if (lower.includes('qualita')) {
        return 'Qualita Uso Suolo Secondario';
      }
      if (lower.includes('varieta')) {
        return 'Varieta Uso Suolo Secondario';
      }
      if (lower.includes('netta')) {
        return 'Sup Netta Uso Suolo Secondario';
      }
      if (lower.includes('sup.') || lower.includes('superficie')) {
        return 'Sup Uso Suolo Secondario';
      }
    }

    // Check for "semina primario" combined with sub-headers
    if (lower.includes('semina primario')) {
      if (lower.includes('epoca')) {
        return 'Epoca Semina Primario';
      }
      if (lower.includes('tipo')) {
        return 'Tipo Semina Primario';
      }
      if (lower.includes('data inizio') || lower.includes('inizio')) {
        return 'Data inizio Semina Primario';
      }
      if (lower.includes('data fine') || lower.includes('fine')) {
        return 'Data fine Semina Primario';
      }
    }

    // Check for "semina secondario" combined with sub-headers
    if (lower.includes('semina secondario')) {
      if (lower.includes('epoca')) {
        return 'Epoca Semina Secondario';
      }
      if (lower.includes('tipo')) {
        return 'Tipo Semina Secondario';
      }
      if (lower.includes('data inizio') || lower.includes('inizio')) {
        return 'Data inizio Semina Secondario';
      }
      if (lower.includes('data fine') || lower.includes('fine')) {
        return 'Data fine Semina Secondario';
      }
    }

    // Build compound name for multi-part headers
    const parts = h.split(' ').filter((p) => p.trim());
    if (parts.length > 1) {
      const lowerParts = parts.map((p) => p.toLowerCase());

      if (lowerParts.includes('primario') || lower.includes('primario')) {
        if (
          lowerParts.includes('occ.') ||
          lowerParts.includes('occupazione') ||
          lower.includes('occ. suolo')
        ) {
          return 'Occupazione Suolo Uso Suolo Primario';
        }
        if (lowerParts.includes('destinazione')) {
          return 'Destinazione Uso Suolo Primario';
        }
        if (lowerParts.includes('uso') && !lower.includes('uso del suolo')) {
          return 'Uso Uso Suolo Primario';
        }
        if (lowerParts.includes('qualita') || lower.includes("qualita'")) {
          return 'Qualita Uso Suolo Primario';
        }
        if (lowerParts.includes('varieta') || lower.includes("varieta'")) {
          return 'Varieta Uso Suolo Primario';
        }
        if (
          lowerParts.includes('sup.') ||
          (lowerParts.includes('superficie') && !lower.includes('netta'))
        ) {
          return 'Superficie Uso Suolo Primario';
        }
        if (lower.includes('netta')) {
          return 'Superficie Netta Uso Suolo Primario';
        }
        if (lowerParts.includes('epoca')) {
          return 'Epoca Semina Primario';
        }
        if (lowerParts.includes('tipo')) {
          return 'Tipo Semina Primario';
        }
        if (lower.includes('data inizio')) {
          return 'Data inizio Semina Primario';
        }
        if (lower.includes('data fine')) {
          return 'Data fine Semina Primario';
        }
      }

      if (lowerParts.includes('secondario') || lower.includes('secondario')) {
        if (
          lowerParts.includes('occ.') ||
          lowerParts.includes('occupazione') ||
          lower.includes('occ. suolo')
        ) {
          return 'Occupazione suolo Uso Suolo Secondario';
        }
        if (lowerParts.includes('destinazione')) {
          return 'Destinazione Uso Suolo Secondario';
        }
        if (lowerParts.includes('uso') && !lower.includes('uso del suolo')) {
          return 'Uso Uso Suolo Secondario';
        }
        if (lowerParts.includes('qualita') || lower.includes("qualita'")) {
          return 'Qualita Uso Suolo Secondario';
        }
        if (lowerParts.includes('varieta') || lower.includes("varieta'")) {
          return 'Varieta Uso Suolo Secondario';
        }
        if (
          lowerParts.includes('sup.') ||
          (lowerParts.includes('superficie') && !lower.includes('netta'))
        ) {
          return 'Sup Uso Suolo Secondario';
        }
        if (lower.includes('netta')) {
          return 'Sup Netta Uso Suolo Secondario';
        }
        if (lowerParts.includes('epoca')) {
          return 'Epoca Semina Secondario';
        }
        if (lowerParts.includes('tipo')) {
          return 'Tipo Semina Secondario';
        }
        if (lower.includes('data inizio')) {
          return 'Data inizio Semina Secondario';
        }
        if (lower.includes('data fine')) {
          return 'Data fine Semina Secondario';
        }
      }
    }

    // Return original if no mapping found, with cleanup
    return h.replace(/\r?\n/g, ' ').trim() || `Column_${index}`;
  });
}

/**
 * Detect the regional format based on normalized headers
 */
function detectFormat(
  headers: string[],
):
  | 'piemonte'
  | 'lombardia'
  | 'emilia_romagna'
  | 'veneto'
  | 'veneto_avepa'
  | 'cia_schedario_viticolo'
  | 'unknown' {
  const headerSet = new Set(headers.map((h) => h.toLowerCase()));
  const headerText = headers.join(' ').toLowerCase();

  // Veneto AVEPA "Piano Utilizzo" format indicators
  // This format has specific columns like "1a Coltura", "Sup. Utilizzata", PAC codes
  const venetoAvepaIndicators = [
    'sup. catastale',
    '1a coltura',
    'sup. utilizzata',
    'parcella di rif',
    'potenz. irriguo',
    'presenza ciclo',
    'tipo con',
  ];
  const venetoAvepaMatches = venetoAvepaIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Check for PAC code pattern in headers (columns with codes like "(870-011-000-000-000)")
  const hasPacCodePattern = headers.some(
    (h) => /\d{3}-\d{3}-\d{3}/.test(h) || /^\(\d{3}-\d{3}/.test(h.trim()),
  );

  // Veneto format indicators (similar to Piemonte but specific to Veneto)
  const venetoIndicators = [
    'comune descrizione',
    'superficie uso suolo primario',
    'superficie netta uso suolo primario',
  ];
  const venetoMatches = venetoIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Check if region/province indicates Veneto
  const hasVenetoRegion =
    headerText.includes('veneto') ||
    headerText.includes('verona') ||
    headerText.includes('vicenza') ||
    headerText.includes('venezia') ||
    headerText.includes('padova') ||
    headerText.includes('treviso') ||
    headerText.includes('rovigo') ||
    headerText.includes('belluno');

  // Piemonte format indicators
  const piemonteIndicators = [
    'unita produttiva',
    'comune descrizione',
    'occupazione suolo uso suolo primario',
    'superficie uso suolo primario',
    'epoca semina primario',
  ];
  const piemonteMatches = piemonteIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Lombardia format indicators
  const lombardiaIndicators = ['cuaa', 'supero', 'tipo utilizzo', 'coltivazione', 'mappale'];
  const lombardiaMatches = lombardiaIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Emilia-Romagna format indicators
  const emiliaIndicators = [
    'id. domanda',
    'occupazione suolo',
    'foglio ',
    'superficie(ha)',
    'data inizio utilizzo',
  ];
  const emiliaMatches = emiliaIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // CIA Schedario Viticolo format indicators
  const ciaIndicators = [
    'descrizione vitigno',
    'forma allevamento',
    'sup. vitata dichiarata',
    'codice vitigno',
    'numero ceppi',
    'unar',
  ];
  const ciaMatches = ciaIndicators.filter(
    (ind) => headerSet.has(ind) || headerText.includes(ind),
  ).length;

  // Check CIA Schedario Viticolo first (very distinctive format)
  if (ciaMatches >= 3) {
    return 'cia_schedario_viticolo';
  }

  // Check Veneto AVEPA first (it has distinctive columns)
  if (venetoAvepaMatches >= 3 || (venetoAvepaMatches >= 2 && hasPacCodePattern)) {
    return 'veneto_avepa';
  }

  // Check Veneto (before Piemonte since they're similar)
  if (venetoMatches >= 2 && hasVenetoRegion) return 'veneto';
  if (piemonteMatches >= 3) return 'piemonte';
  if (lombardiaMatches >= 3) return 'lombardia';
  if (emiliaMatches >= 3) return 'emilia_romagna';

  return 'unknown';
}

/**
 * Check if a row is empty
 */
function isEmptyRow(row: (string | number)[]): boolean {
  if (!row) return true;
  return row.every((c) => c === '' || c === null || c === undefined);
}

/**
 * Convert detected headers and data back to ParsedRow format
 * Compatible with existing agent code
 */
export function convertToParseResult(detection: HeaderDetectionResult): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const rows = detection.rawRows.map((row) => {
    const record: Record<string, string> = {};
    detection.headers.forEach((header, idx) => {
      record[header] = String(row[idx] ?? '').trim();
    });
    return record;
  });

  return {
    headers: detection.headers,
    rows,
  };
}
