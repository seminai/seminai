/**
 * Check if the CSV headers match the Veneto format
 */
export function isVenetoFormat(headers: string[]): boolean {
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

  // Colonne distintive del formato Veneto
  const requiredColumns = [
    'comune descrizione',
    'foglio',
    'particella',
    'superficie uso suolo primario',
  ];

  const hasAllRequired = requiredColumns.every((col) =>
    normalizedHeaders.some((h) => h === col || h.includes(col)),
  );

  // Verifica colonne specifiche Veneto o provincia Veneto
  const hasVenetoSpecific =
    normalizedHeaders.some((h) => h.includes('superficie uso suolo primario')) ||
    normalizedHeaders.some((h) => h.includes('superficie netta uso suolo primario'));

  // Check if region/province indicates Veneto
  const hasVenetoRegion = normalizedHeaders.some((h) => {
    const value = h.toLowerCase();
    return (
      value.includes('veneto') ||
      value.includes('verona') ||
      value.includes('vicenza') ||
      value.includes('venezia') ||
      value.includes('padova') ||
      value.includes('treviso') ||
      value.includes('rovigo') ||
      value.includes('belluno')
    );
  });

  return hasAllRequired && (hasVenetoSpecific || hasVenetoRegion);
}

/**
 * Parse "Occupazione Suolo Uso Suolo Primario" column to extract uso suolo description
 * Example: "[003] COLZA" -> "COLZA"
 * Example: "[587] GRANO (FRUMENTO) TENERO" -> "GRANO (FRUMENTO) TENERO"
 * Example: "[780] USO NON AGRICOLO - TARE" -> "NON AGRICOLO (TARE)"
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
 * Parse date from Veneto format (DD/MM/YYYY) to ISO format (YYYY-MM-DD)
 * Also handles ISO timestamp format (YYYY-MM-DD HH:MM:SS.0)
 */
export function parseVenetoDate(dateStr: string): string | null {
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
 * Parse superficie from Veneto format
 * The value uses comma as decimal separator (Italian format)
 * Example: "6,5700" -> 6.57 (already in hectares)
 */
export function parseVenetoSuperficie(value: string): number | null {
  if (!value || value.trim() === '') return null;

  // Replace comma with dot for parsing
  const cleaned = value.trim().replace(',', '.');
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse "Comune Descrizione" to extract comune name and provincia
 * Example: "VERONA (VR)" -> { comune: "VERONA", provincia: "VR" }
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
 * Example: "006138 - VERONA - VIA ROMA 10"
 * Returns: { code: "006138", comune: "VERONA", address: "VIA ROMA 10" }
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
