import { LOMBARDIA_COLUMN_MAPPING } from './lombardia_file_structure.part-01-lombardia-column-mapping';

/**
 * Parse VARIETA' column
 * Example: "DEKALB" -> "DEKALB"
 * Returns null if empty or not specified
 */
export function parseVarieta(varieta: string | null): string | null {
  if (!varieta) return null;
  const trimmed = varieta.trim();
  if (trimmed === '' || trimmed === '-' || trimmed.toUpperCase() === 'NON SPECIFICATA') {
    return null;
  }
  return trimmed;
}

/**
 * Parse BIOL/CONV column to determine if organic farming
 * Values: "S" = biologico, "N" or empty = convenzionale
 */
export function parseIsBiologico(biolConv: string | null): boolean {
  if (!biolConv) return false;
  const upper = biolConv.trim().toUpperCase();
  return upper === 'S' || upper === 'SI' || upper === 'Y' || upper === 'YES' || upper === 'BIO';
}

/**
 * Parse CODICE IRRIGAZIONE column
 * Returns the irrigation code or null if not irrigated
 */
export function parseCodiceIrrigazione(codiceIrrigazione: string | null): string | null {
  if (!codiceIrrigazione) return null;
  const trimmed = codiceIrrigazione.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '0' || trimmed === '000') {
    return null;
  }
  return trimmed;
}

/**
 * Parse POTENZIALITA' IRRIGUA column
 * Returns true if the field has irrigation potential
 */
export function hasPotenzialitaIrrigua(potenzialita: string | null): boolean {
  if (!potenzialita) return false;
  const upper = potenzialita.trim().toUpperCase();
  return upper === 'S' || upper === 'SI' || upper === 'Y' || upper === 'YES';
}

/**
 * Parse COLTIVAZIONE column to determine cycle type
 * Returns: 'primary' | 'secondary' | null
 */
export function parseColtivazioneCycle(coltivazione: string): 'primary' | 'secondary' | null {
  if (!coltivazione) return null;
  const upper = coltivazione.toUpperCase().trim();
  if (upper === 'PRIMARIA' || upper === 'PRIMARY') return 'primary';
  if (upper === 'SECONDARIA' || upper === 'SECONDARY') return 'secondary';
  return null;
}

/**
 * Parse BIOL/CONV column to determine if organic
 */
export function isOrganicFromBiolConv(biolConv: string): boolean {
  if (!biolConv) return false;
  const upper = biolConv.toUpperCase().trim();
  return upper === 'S' || upper === 'SI' || upper === 'Y' || upper === 'YES' || upper === 'BIO';
}

/**
 * Get the best available area value from Lombardia format (in MQ)
 * Priority: SUP. UTILIZZATA > SUPERFICIE > SUP. GIS > SUP. CATASTALE
 */
export function getBestAreaMq(row: Record<string, string>): number | null {
  const cols = LOMBARDIA_COLUMN_MAPPING;

  const parseNum = (val: string | undefined): number | null => {
    if (!val) return null;
    const cleaned = val.replace(',', '.');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  };

  // Try in order of preference for production unit area
  const supUtilizzata = parseNum(row[cols.superficieUtilizzata]);
  if (supUtilizzata !== null && supUtilizzata > 0) return supUtilizzata;

  const superficie = parseNum(row[cols.superficie]);
  if (superficie !== null && superficie > 0) return superficie;

  const supGis = parseNum(row[cols.superficieGis]);
  if (supGis !== null && supGis > 0) return supGis;

  const supCatastale = parseNum(row[cols.superficieCatastale]);
  if (supCatastale !== null && supCatastale > 0) return supCatastale;

  return null;
}
