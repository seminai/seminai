/**
 * Parse "OCCUPAZIONE SUOLO" column to extract uso suolo description
 * Example: "ERBA MEDICA  (SP. MEDICAGO SATIVA L. (VARIETA'))" -> "ERBA MEDICA"
 * Example: "GRANTURCO (MAIS)" -> "GRANTURCO (MAIS)"
 * Example: "USO NON AGRICOLO - FABBRICATI" -> "NON AGRICOLO (FABBRICATI)"
 * Example: "USO NON AGRICOLO - ALTRO" -> "NON AGRICOLO (ALTRO)"
 * Example: "USO NON AGRICOLO - TARE " -> "NON AGRICOLO (TARE)"
 */
export function parseUsoSuoloFromOccupazione(occupazioneSuolo: string): string | null {
  if (!occupazioneSuolo) return null;

  const trimmed = occupazioneSuolo.trim();

  // Handle non-agricultural uses - make them readable
  if (trimmed.includes('USO NON AGRICOLO')) {
    // Extract the type: "USO NON AGRICOLO - FABBRICATI" -> "FABBRICATI"
    const match = trimmed.match(/USO NON AGRICOLO\s*-?\s*(.+)/i);
    if (match && match[1]) {
      const type = match[1].trim();
      return `NON AGRICOLO (${type})`;
    }
    return 'NON AGRICOLO';
  }

  // Handle TARE without "USO NON AGRICOLO" prefix
  if (trimmed.toUpperCase().startsWith('TARE')) {
    return `NON AGRICOLO (${trimmed})`;
  }

  // Remove scientific name in parentheses for certain crops
  // "ERBA MEDICA  (SP. MEDICAGO SATIVA L. (VARIETA'))" -> "ERBA MEDICA"
  const withoutScientific = trimmed.replace(/\s+\(SP\..*$/i, '').trim();

  return withoutScientific || null;
}

/**
 * Parse date from Emilia-Romagna format (DD-MM-YYYY) to ISO format (YYYY-MM-DD)
 */
export function parseEmiliaRomagnaDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;

  // Format: DD-MM-YYYY (with dashes)
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    // Try with slashes DD/MM/YYYY
    const slashParts = dateStr.split('/');
    if (slashParts.length === 3) {
      const day = slashParts[0].padStart(2, '0');
      const month = slashParts[1].padStart(2, '0');
      const year = slashParts[2];
      if (year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }
    return null;
  }

  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];

  if (year.length !== 4) return null;

  return `${year}-${month}-${day}`;
}

/**
 * Parse superficie from Emilia-Romagna format
 * The value uses comma as decimal separator (Italian format)
 * Example: "0,8397" -> 0.8397 (already in hectares)
 */
export function parseEmiliaRomagnaSuperficie(value: string): number | null {
  if (!value || value.trim() === '') return null;

  // Replace comma with dot for parsing
  const cleaned = value.trim().replace(',', '.');
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
}

/**
 * Check if a row represents a non-agricultural use
 */
export function isNonAgriculturalUse(occupazioneSuolo: string): boolean {
  if (!occupazioneSuolo) return false;
  const upper = occupazioneSuolo.toUpperCase();
  return (
    upper.includes('USO NON AGRICOLO') ||
    upper.includes('FABBRICATI') ||
    upper.includes('TARE') ||
    upper.includes('INCOLTI')
  );
}

/**
 * Check if the row is SAU (Superficie Agricola Utilizzata)
 */
export function isSauRow(flagSau: string): boolean {
  if (!flagSau) return false;
  const upper = flagSau.toUpperCase().trim();
  return upper === 'S' || upper === 'SI' || upper === 'Y' || upper === 'YES';
}

/**
 * Check if the row is organic/biological
 */
export function isOrganicFromBiologico(biologico: string): boolean {
  if (!biologico) return false;
  const upper = biologico.toUpperCase().trim();
  return upper === 'BIOLOGICO' || upper === 'BIO' || upper === 'S' || upper === 'SI';
}

/**
 * Get the region name normalized
 */
export function normalizeRegione(regione: string): string {
  if (!regione) return 'EMILIA ROMAGNA';

  const upper = regione.toUpperCase().trim();

  // Handle common variations
  if (upper.includes('EMILIA') && upper.includes('ROMAGNA')) {
    return 'EMILIA ROMAGNA';
  }
  if (upper === 'ER' || upper === 'E-R') {
    return 'EMILIA ROMAGNA';
  }

  return upper;
}

/**
 * Parse particella number, handling leading zeros
 * Example: "00071" -> "71" (trimmed) or keep as is depending on preference
 */
export function normalizeParticella(particella: string): string {
  if (!particella) return '';

  const trimmed = particella.trim();

  // Keep leading zeros as they may be significant in some cadastral systems
  // But remove if it's just zeros
  if (/^0+$/.test(trimmed)) {
    return '0';
  }

  // Remove leading zeros for display but keep the original format
  return trimmed.replace(/^0+/, '') || trimmed;
}

/**
 * Normalize foglio number
 */
export function normalizeFoglio(foglio: string): string {
  if (!foglio) return '';
  return foglio.trim();
}
