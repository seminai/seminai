/**
 * Lombardia CSV File Structure Template
 *
 * This template defines the column mapping for agricultural field CSV files
 * from Lombardia region (SISCO/SIAN format).
 *
 * ## SISCO Crop Codification System
 *
 * The TIPO UTILIZZO column uses a standardized 4-part code system:
 * **Format**: `XXX-XXX-XXX-XXX DESCRIPTION`
 *
 * ### Code Structure:
 * 1. **CODI_OCCU** (Occupazione): Main crop code (3 digits)
 *    - 001 = GRANTURCO (MAIS)
 *    - 002 = GRANO (FRUMENTO) DURO
 *    - 004 = SOIA
 *    - 005 = GIRASOLE
 *    - 157 = USO NON AGRICOLO - FABBRICATI
 *    - 788 = SIEPI E FASCE ALBERATE
 *
 * 2. **CODI_DEST_USO** (Destinazione): Usage destination (3 digits)
 *    - 000 = Generic/Not specified
 *    - 011 = FAVE, SEMI, GRANELLA (grains, seeds)
 *    - 002 = DA FORAGGIO (forage)
 *    - 010 = DA VIVAIO (nursery)
 *
 * 3. **CODI_USO** (Uso): Specific use (3 digits)
 *    - 000 = Generic
 *    - 037 = SPERIMENTALE (experimental)
 *    - 024 = FOGLIE (leaves)
 *
 * 4. **CODI_QUAL** (Qualità): Quality/characteristics (3 digits)
 *    - 000 = Generic
 *    - 022 = ENERGETICO (energy crop)
 *    - 050 = DA TAVOLA (table/food)
 *    - 064 = PASTONE (mash)
 *    - 066 = DA POLENTA (for polenta)
 *    - 067 = PROTEICO (protein-rich)
 *
 * ### Examples:
 * - `001-011-000-000 GRANTURCO (MAIS)` = Corn for grain/seed production (generic)
 * - `001-011-000-064 GRANTURCO (MAIS)` = Corn for grain (mash type)
 * - `004-011-000-000 SOIA` = Soybean for grain/seed (generic)
 * - `005-011-000-022 GIRASOLE` = Sunflower for grain (energy crop)
 * - `157-000-000-000 USO NON AGRICOLO - FABBRICATI` = Non-agricultural use (buildings)
 *
 * ### Lookup Table:
 * The complete SISCO codification is available in:
 * `dataset/sisco_lombardia/lombardia_sisco_utilizzi_2025.csv`
 *
 * This file contains the full mapping of all codes to their descriptions.
 *
 * ## CSV Structure Example:
 * CUAA;SUPERO;COMUNE;PROV;SEZ CENS;FOGLIO;MAPPALE;SUB;COLTIVAZIONE;TIPO UTILIZZO;
 * SUP. GIS;SUP. UTILIZZATA;SUP. CONDOTTA;CONDUZIONE;PROPRIETARIO;N. REGISTRAZIONE;
 * PROPRIETARIO CATASTO;NUM PROPRIETARI CATASTO;SUP. CATASTALE;DATA FINE CONTRATTO;
 * SUP. GRAFICA;ISOLA DI APPARTENENZA;PRATICA DI MANTENIMENTO;CODICE PASCOLO;
 * CODICE PASCOLO ALLEVAMENTO;BIOL/CONV;VARIETA';CODICE IRRIGAZIONE;
 * POTENZIALITA' IRRIGUA;DATA SEMINA;DATA RACCOLTA;EPOCA DI SEMINA;ANNO CAMPAGNA;SUPERFICIE
 *
 * ## Important Notes:
 * - All surface values (SUP. *) are in **square meters (MQ)**, not hectares
 * - MAPPALE is the Lombardia term for Particella (cadastral parcel)
 * - COLTIVAZIONE can be "Primaria" or "Secondaria" (primary/secondary crop cycle)
 * - BIOL/CONV: "S" = organic (biologico), "N" or empty = conventional
 * - Dates are in DD/MM/YYYY format
 */

export interface LombardiaColumnMapping {
  // Identificativi azienda
  cuaa: string;
  supero: string; // Campo aggiuntivo (spesso vuoto)
  // Ubicazione
  comune: string;
  provincia: string;
  sezioneCensuaria: string;
  // Dati catastali
  foglio: string;
  mappale: string; // = Particella (in Lombardia chiamato MAPPALE)
  subalterno: string;
  // Superfici (tutte in MQ)
  superficieGis: string;
  superficieUtilizzata: string;
  superficieCondotta: string;
  superficieCatastale: string;
  superficieGrafica: string; // Superficie grafica
  superficie: string; // Superficie finale (ultimo campo)
  // Uso del suolo
  coltivazione: string; // Primaria/Secondaria
  tipoUtilizzo: string; // Codice + descrizione uso suolo (formato: XXX-XXX-XXX-XXX DESCRIZIONE)
  // Conduzione
  conduzione: string;
  proprietario: string;
  numeroRegistrazione: string;
  proprietarioCatasto: string;
  numeroProprietariCatasto: string;
  dataFineContratto: string;
  // Pratica
  isolaAppartenenza: string;
  praticaMantenimento: string;
  codicePascolo: string;
  codicePascoloAllevamento: string;
  // Biologico e varietà
  biologicoConvenzionale: string;
  varieta: string;
  // Irrigazione
  codiceIrrigazione: string;
  potenzialitaIrrigua: string;
  // Date
  dataSemina: string;
  dataRaccolta: string;
  epocaSemina: string;
  annoCampagna: string;
}

/**
 * Default column mapping for Lombardia CSV format
 * Based on SISCO Lombardia official format
 */
export const LOMBARDIA_COLUMN_MAPPING: LombardiaColumnMapping = {
  // Identificativi
  cuaa: 'CUAA',
  supero: 'SUPERO',
  // Ubicazione
  comune: 'COMUNE',
  provincia: 'PROV',
  sezioneCensuaria: 'SEZ CENS',
  // Dati catastali
  foglio: 'FOGLIO',
  mappale: 'MAPPALE', // Particella in Lombardia è chiamata MAPPALE
  subalterno: 'SUB',
  // Superfici (in MQ)
  superficieGis: 'SUP. GIS',
  superficieUtilizzata: 'SUP. UTILIZZATA',
  superficieCondotta: 'SUP. CONDOTTA',
  superficieCatastale: 'SUP. CATASTALE',
  superficieGrafica: 'SUP. GRAFICA',
  superficie: 'SUPERFICIE',
  // Uso del suolo
  coltivazione: 'COLTIVAZIONE',
  tipoUtilizzo: 'TIPO UTILIZZO',
  // Conduzione
  conduzione: 'CONDUZIONE',
  proprietario: 'PROPRIETARIO',
  numeroRegistrazione: 'N. REGISTRAZIONE',
  proprietarioCatasto: 'PROPRIETARIO CATASTO',
  numeroProprietariCatasto: 'NUM PROPRIETARI CATASTO',
  dataFineContratto: 'DATA FINE CONTRATTO',
  // Pratica
  isolaAppartenenza: 'ISOLA DI APPARTENENZA',
  praticaMantenimento: 'PRATICA DI MANTENIMENTO',
  codicePascolo: 'CODICE PASCOLO',
  codicePascoloAllevamento: 'CODICE PASCOLO ALLEVAMENTO',
  // Biologico
  biologicoConvenzionale: 'BIOL/CONV',
  varieta: "VARIETA'",
  // Irrigazione
  codiceIrrigazione: 'CODICE IRRIGAZIONE',
  potenzialitaIrrigua: "POTENZIALITA' IRRIGUA",
  // Date
  dataSemina: 'DATA SEMINA',
  dataRaccolta: 'DATA RACCOLTA',
  epocaSemina: 'EPOCA DI SEMINA',
  annoCampagna: 'ANNO CAMPAGNA',
};

/**
 * SISCO crop code structure
 * Format: XXX-XXX-XXX-XXX (OCCU-DEST-USO-QUAL)
 * Example: 001-011-000-000 = GRANTURCO (MAIS) - FAVE, SEMI, GRANELLA
 */
export interface SiscoCropCode {
  codOccupazione: string; // First 3 digits (e.g., 001 = GRANTURCO)
  codDestinazione: string; // Second 3 digits (e.g., 011 = FAVE, SEMI, GRANELLA)
  codUso: string; // Third 3 digits (e.g., 000 = generic, 037 = SPERIMENTALE)
  codQualita: string; // Fourth 3 digits (e.g., 000 = generic, 022 = ENERGETICO)
  full: string; // Full code: XXX-XXX-XXX-XXX
}

/**
 * SISCO crop description from lookup table
 */
export interface SiscoCropDescription {
  code: SiscoCropCode;
  occupazione: string; // Main crop name (e.g., GRANTURCO (MAIS))
  destinazione: string | null; // Destination (e.g., FAVE, SEMI, GRANELLA)
  uso: string | null; // Use (e.g., SPERIMENTALE)
  qualita: string | null; // Quality (e.g., ENERGETICO)
  fullDescription: string; // Combined description
}

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
