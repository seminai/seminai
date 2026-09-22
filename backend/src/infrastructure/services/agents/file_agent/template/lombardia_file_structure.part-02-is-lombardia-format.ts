import { SiscoCropCode } from './lombardia_file_structure.part-01-lombardia-column-mapping';

/**
 * Check if the CSV headers match the Lombardia format
 */
export function isLombardiaFormat(headers: string[]): boolean {
  const normalizedHeaders = headers.map((h) => h.trim().toUpperCase());
  const requiredColumns = ['CUAA', 'FOGLIO', 'MAPPALE', 'COMUNE', 'TIPO UTILIZZO'];
  return requiredColumns.every((col) =>
    normalizedHeaders.some((h) => h === col || h.includes(col)),
  );
}

/**
 * Parse SISCO crop code from TIPO UTILIZZO string
 * Format: "001-011-000-000 GRANTURCO (MAIS)" -> {codOccupazione: "001", codDestinazione: "011", ...}
 *
 * @param tipoUtilizzo Full TIPO UTILIZZO string with code and description
 * @returns Parsed SISCO crop code or null if invalid
 */
export function parseSiscoCropCode(tipoUtilizzo: string): SiscoCropCode | null {
  if (!tipoUtilizzo) return null;

  // Extract code part: XXX-XXX-XXX-XXX at the beginning
  const codeMatch = tipoUtilizzo.match(/^(\d{3})-(\d{3})-(\d{3})-(\d{3})/);
  if (!codeMatch) return null;

  return {
    codOccupazione: codeMatch[1],
    codDestinazione: codeMatch[2],
    codUso: codeMatch[3],
    codQualita: codeMatch[4],
    full: `${codeMatch[1]}-${codeMatch[2]}-${codeMatch[3]}-${codeMatch[4]}`,
  };
}

/**
 * Parse "TIPO UTILIZZO" column to extract uso suolo description
 * Example: "001-011-000-000 GRANTURCO (MAIS)" -> "GRANTURCO (MAIS)"
 * Example: "788-000-000-000 SIEPI E FASCE ALBERATE" -> "SIEPI E FASCE ALBERATE"
 *
 * This is a simple extraction of the description part after the code.
 * For detailed parsing with SISCO lookup, use parseCropFromTipoUtilizzo().
 */
export function parseUsoSuoloFromTipoUtilizzo(tipoUtilizzo: string): string | null {
  if (!tipoUtilizzo) return null;

  // Format: "XXX-XXX-XXX-XXX DESCRIPTION"
  // Remove code prefix (e.g., "001-011-000-000 ")
  const withoutCode = tipoUtilizzo.replace(/^\d{3}-\d{3}-\d{3}-\d{3}\s+/, '');

  if (!withoutCode) return null;

  // Filter out non-agricultural uses
  if (withoutCode.includes('USO NON AGRICOLO') || withoutCode.includes('FABBRICATI')) {
    return 'USO NON AGRICOLO';
  }

  return withoutCode.trim() || null;
}

/**
 * Parse date from Lombardia format (DD/MM/YYYY) to ISO format (YYYY-MM-DD)
 */
export function parseLombardiaDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;

  // Format: DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;

  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];

  if (year.length !== 4) return null;

  return `${year}-${month}-${day}`;
}

/**
 * Get region name based on province code
 */
export function getRegioneFromProvincia(provincia: string): string {
  const lombardiaProvinces = [
    'BG',
    'BS',
    'CO',
    'CR',
    'LC',
    'LO',
    'MN',
    'MI',
    'MB',
    'PV',
    'SO',
    'VA',
  ];
  const emiliaProvinces = ['BO', 'FE', 'FC', 'MO', 'PR', 'PC', 'RA', 'RE', 'RN'];
  const veneto = ['BL', 'PD', 'RO', 'TV', 'VE', 'VR', 'VI'];
  const piemonte = ['AL', 'AT', 'BI', 'CN', 'NO', 'TO', 'VB', 'VC'];

  const prov = provincia?.toUpperCase().trim();

  if (lombardiaProvinces.includes(prov)) return 'LOMBARDIA';
  if (emiliaProvinces.includes(prov)) return 'EMILIA ROMAGNA';
  if (veneto.includes(prov)) return 'VENETO';
  if (piemonte.includes(prov)) return 'PIEMONTE';

  return 'ITALIA';
}

/**
 * Parse "TIPO UTILIZZO" to extract crop code
 * Example: "562-002-054-043 ERBA MEDICA..." -> "562-002-054-043"
 */
export function parseCropCodeFromTipoUtilizzo(tipoUtilizzo: string): string | null {
  if (!tipoUtilizzo) return null;
  const match = tipoUtilizzo.match(/^([\d-]+)\s+/);
  return match ? match[1] : null;
}

/**
 * Parse "TIPO UTILIZZO" to extract full crop description with SISCO codes
 * Example: "001-011-000-000 GRANTURCO (MAIS)"
 * Returns: {
 *   code: "001-011-000-000",
 *   name: "GRANTURCO (MAIS)",
 *   details: null,
 *   fullDescription: "GRANTURCO (MAIS)",
 *   siscoCode: { codOccupazione: "001", codDestinazione: "011", codUso: "000", codQualita: "000", full: "001-011-000-000" }
 * }
 *
 * Note: This function extracts the structure but does NOT perform SISCO lookup.
 * The SISCO lookup should be done separately using the lombardia_sisco_utilizzi_2025.csv file.
 */
export function parseCropFromTipoUtilizzo(tipoUtilizzo: string): {
  code: string | null;
  name: string | null;
  details: string | null;
  fullDescription: string | null;
  siscoCode: SiscoCropCode | null;
} {
  if (!tipoUtilizzo) {
    return { code: null, name: null, details: null, fullDescription: null, siscoCode: null };
  }

  // Extract SISCO code
  const siscoCode = parseSiscoCropCode(tipoUtilizzo);
  const code = siscoCode?.full || null;

  // Remove code prefix to get description
  const withoutCode = tipoUtilizzo.replace(/^\d{3}-\d{3}-\d{3}-\d{3}\s+/, '');

  if (!withoutCode) {
    return { code, name: null, details: null, fullDescription: null, siscoCode };
  }

  // The description in TIPO UTILIZZO is usually just the main crop name
  // For example: "GRANTURCO (MAIS)", "SIEPI E FASCE ALBERATE", etc.
  const name = withoutCode.trim();

  // For Lombardia format, the full structure is in the SISCO lookup table
  // Here we just extract what's visible in the field
  const fullDescription = name;

  return { code, name, details: null, fullDescription, siscoCode };
}

/**
 * Check if a TIPO UTILIZZO represents a non-agricultural use
 * Common non-agricultural codes:
 * - 157-000-000-000: USO NON AGRICOLO - FABBRICATI
 * - 788-000-000-000: SIEPI E FASCE ALBERATE
 * - 214-000-048-037: SUPERFICI AGRICOLE RITIRATE DALLA PRODUZIONE
 */
export function isNonAgriculturalUse(tipoUtilizzo: string): boolean {
  if (!tipoUtilizzo) return false;
  const upper = tipoUtilizzo.toUpperCase();
  return (
    upper.includes('USO NON AGRICOLO') ||
    upper.includes('FABBRICATI') ||
    upper.includes('TARE') ||
    upper.includes('MANUFATTI') ||
    upper.includes('SIEPI E FASCE ALBERATE') ||
    upper.includes('SUPERFICI AGRICOLE RITIRATE')
  );
}
