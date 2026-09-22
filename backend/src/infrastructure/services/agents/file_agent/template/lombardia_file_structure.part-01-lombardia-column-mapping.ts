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
