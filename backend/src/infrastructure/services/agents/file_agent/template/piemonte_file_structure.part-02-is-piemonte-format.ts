/**
 * Check if the CSV headers match the Piemonte format
 */
export function isPiemonteFormat(headers: string[]): boolean {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

  // Colonne distintive del formato Piemonte SATA
  const requiredColumns = [
    'unita produttiva',
    'comune descrizione',
    'foglio',
    'particella',
    'occupazione suolo uso suolo primario',
  ];

  const hasAllRequired = requiredColumns.every((col) =>
    normalizedHeaders.some((h) => h === col || h.includes(col)),
  );

  // Verifica colonne specifiche che distinguono da altri formati
  const hasPiemonteSpecific =
    normalizedHeaders.some((h) => h.includes('epoca semina primario')) ||
    normalizedHeaders.some((h) => h.includes('tipo semina primario')) ||
    normalizedHeaders.some((h) => h.includes('superficie uso suolo primario'));

  return hasAllRequired && hasPiemonteSpecific;
}

/**
 * Parse "Occupazione Suolo Uso Suolo Primario" column to extract uso suolo description
 * Example: "[003] COLZA" -> "COLZA"
 * Example: "[587] GRANO (FRUMENTO) TENERO" -> "GRANO (FRUMENTO) TENERO"
 * Example: "[780] USO NON AGRICOLO - TARE" -> "NON AGRICOLO (TARE)"
 * Example: "[660] MANUFATTI" -> "MANUFATTI"
 */
export function parseUsoSuoloFromOccupazione(occupazioneSuolo: string): string | null {
  if (!occupazioneSuolo) return null;

  const trimmed = occupazioneSuolo.trim();

  // Remove code prefix: "[003] COLZA" -> "COLZA"
  const withoutCode = trimmed.replace(/^\[\d+\]\s*/, '');

  if (!withoutCode || withoutCode === '-') return null;

  // Handle non-agricultural uses
  if (withoutCode.includes('USO NON AGRICOLO')) {
    const match = withoutCode.match(/USO NON AGRICOLO\s*-?\s*(.+)/i);
    if (match && match[1]) {
      const type = match[1].trim();
      return `NON AGRICOLO (${type})`;
    }
    return 'NON AGRICOLO';
  }

  return withoutCode;
}

/**
 * Extract crop code from occupazione suolo
 * Example: "[003] COLZA" -> "003"
 */
export function extractCropCode(occupazioneSuolo: string): string | null {
  if (!occupazioneSuolo) return null;

  const match = occupazioneSuolo.match(/^\[(\d+)\]/);
  return match ? match[1] : null;
}

/**
 * Parse date from Piemonte format (DD/MM/YYYY) to ISO format (YYYY-MM-DD)
 * Also handles ISO timestamp format (YYYY-MM-DD HH:MM:SS.0)
 */
export function parsePiemonteDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const trimmed = dateStr.trim();

  // Handle ISO timestamp format: "2025-01-01 00:00:00.0" or "2025-01-01"
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Format: DD/MM/YYYY
  const parts = trimmed.split('/');
  if (parts.length !== 3) return null;

  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];

  if (year.length !== 4) return null;

  return `${year}-${month}-${day}`;
}

/**
 * Parse superficie from Piemonte format
 * The value uses comma as decimal separator (Italian format)
 * Example: "6,5700" -> 6.57 (already in hectares)
 */
export function parsePiemonteSuperficie(value: string): number | null {
  if (!value || value.trim() === '') return null;

  // Replace comma with dot for parsing
  const cleaned = value.trim().replace(',', '.');
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse "Comune Descrizione" to extract comune name and provincia
 * Example: "POZZOLO FORMIGARO (AL)" -> { comune: "POZZOLO FORMIGARO", provincia: "AL" }
 */
export function parseComuneDescrizione(comuneDescrizione: string): {
  comune: string;
  provincia: string | null;
} {
  if (!comuneDescrizione) {
    return { comune: '', provincia: null };
  }

  const trimmed = comuneDescrizione.trim();

  // Match format: "COMUNE NAME (XX)"
  const match = trimmed.match(/^(.+?)\s*\(([A-Z]{2})\)$/);
  if (match) {
    return {
      comune: match[1].trim(),
      provincia: match[2],
    };
  }

  return { comune: trimmed, provincia: null };
}

/**
 * Parse "Unita produttiva" to extract code, comune, and address
 * Example: "006138 - POZZOLO FORMIGARO - STR. CAPURRO 19"
 * Returns: { code: "006138", comune: "POZZOLO FORMIGARO", address: "STR. CAPURRO 19" }
 */
export function parseUnitaProduttiva(unitaProduttiva: string): {
  code: string | null;
  comune: string | null;
  address: string | null;
} {
  if (!unitaProduttiva) {
    return { code: null, comune: null, address: null };
  }

  const parts = unitaProduttiva.split(' - ').map((p) => p.trim());

  if (parts.length >= 3) {
    return {
      code: parts[0] || null,
      comune: parts[1] || null,
      address: parts.slice(2).join(' - ') || null,
    };
  }

  if (parts.length === 2) {
    return {
      code: parts[0] || null,
      comune: parts[1] || null,
      address: null,
    };
  }

  return { code: parts[0] || null, comune: null, address: null };
}

/**
 * Check if a row represents a non-agricultural use
 */
export function isNonAgriculturalUse(occupazioneSuolo: string): boolean {
  if (!occupazioneSuolo) return false;
  const upper = occupazioneSuolo.toUpperCase();
  return (
    upper.includes('USO NON AGRICOLO') ||
    upper.includes('MANUFATTI') ||
    upper.includes('TARE') ||
    upper.includes('FOSSATI') ||
    upper.includes('FABBRICATI') ||
    upper.includes('SIEPI') ||
    upper.includes('FASCE TAMPONE')
  );
}

/**
 * Check if the row is organic/biological
 */
export function isOrganicFromBio(bioBiologico: string): boolean {
  if (!bioBiologico) return false;
  const upper = bioBiologico.toUpperCase().trim();
  return upper === 'S' || upper === 'SI' || upper === 'Y' || upper === 'YES' || upper === 'BIO';
}
