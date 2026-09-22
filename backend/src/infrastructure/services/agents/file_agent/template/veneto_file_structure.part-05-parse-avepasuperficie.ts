/**
 * Parse superficie from AVEPA "Piano Utilizzo" format (handles Italian number format).
 * AVEPA format values are ALWAYS in MQ (square meters), so we always divide by 10000.
 * Example: "32278" -> 3.2278 (32278 MQ = 3.2278 HA)
 * Example: "42" -> 0.0042 (42 MQ = 0.0042 HA)
 */
export function parseAVEPASuperficie(value: string | number): number | null {
  if (value === null || value === undefined || value === '') return null;

  let numValue: number;

  if (typeof value === 'number') {
    numValue = value;
  } else {
    // Replace comma with dot for parsing
    const cleaned = value.trim().replace(',', '.');
    numValue = parseFloat(cleaned);
  }

  if (isNaN(numValue)) return null;

  // AVEPA "Piano Utilizzo" format values are ALWAYS in MQ (square meters)
  return numValue / 10000;
}

/**
 * Check if a row from AVEPA format is valid (not empty, has required data)
 */
export function isValidAVEPARow(row: Record<string, string>): boolean {
  // Must have at least comune and some superficie
  const hasComune = !!(row['Comune'] || row['comune']);
  const hasSuperficie = !!(
    row['Sup. Utilizzata'] ||
    row['sup. utilizzata'] ||
    row['Sup. Catastale'] ||
    row['sup. catastale']
  );

  return hasComune && hasSuperficie;
}

/**
 * Check if AVEPA row represents non-agricultural use
 */
export function isAVEPANonAgriculturalUse(primaColtura: string): boolean {
  if (!primaColtura) return false;

  const upper = primaColtura.toUpperCase();
  return (
    upper.includes('USO NON AGRICOLO') ||
    upper.includes('TARE') ||
    upper.includes('FABBRICATI') ||
    upper.includes('FOSSATI') ||
    upper.includes('MANUFATTI') ||
    upper.includes('OVERLAPPING') ||
    upper === 'OVERLAPPING'
  );
}

/**
 * Get PAC code column index from AVEPA format
 * The PAC code is typically in a column containing values like "(870-011-000-000-000)"
 */
export function findPacCodeColumnIndex(headers: string[], sampleRow: string[]): number {
  // First, check headers for PAC pattern
  for (let i = 0; i < headers.length; i++) {
    if (/\d{3}-\d{3}/.test(headers[i])) {
      return i;
    }
  }

  // Check sample row for PAC pattern
  for (let i = 0; i < sampleRow.length; i++) {
    const value = String(sampleRow[i] || '');
    if (/\(\d{3}-\d{3}-\d{3}-\d{3}-\d{3}\)/.test(value)) {
      return i;
    }
  }

  // Default: columns W-X are typically indices 22-23 in Excel
  return 22;
}
