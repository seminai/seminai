/**
 * Extract metadata from early rows (CUAA, Denominazione, etc.)
 */
export function extractMetadata(rows: (string | number)[][]): Record<string, string> {
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
export function isMetadataRow(row: (string | number)[]): boolean {
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
export function looksLikeDataRow(row: (string | number)[]): boolean {
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
