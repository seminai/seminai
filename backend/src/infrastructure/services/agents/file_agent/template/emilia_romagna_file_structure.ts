/**
 * Emilia-Romagna CSV File Structure Template
 *
 * This template defines the column mapping for agricultural field CSV files
 * from Emilia-Romagna region (AGEA/PAC format).
 *
 * Example CSV header:
 * ID. DOMANDA;ANNO;COD. STATO DOMANDA;STATO DOMANDA;CUAA;RAGIONE SOCIALE;CAA;CAA LOCALE;
 * ID. PARTICELLA;COD. REGIONE;REGIONE;PROVINCIA;COMUNE;COD. NAZIONALE;FOGLIO ;PARTICELLA;
 * SUBALTERNO;FASCIA ALTIMETRICA;IRRIGABILITA';ROT. COLTURALE;DATA RIFERIMENTO;ID. ISOLA;
 * ID. APPEZZAMENTO;COD. COLTURA;COD. OCC. SUOLO;OCCUPAZIONE SUOLO;COD. DEST.;DESTINAZIONE;
 * COD. USO;USO;COD. QUALITA;QUALITA;COD. VARIETA;VARIETA;COD. MACROUSO;DESC. MACROUSO;
 * COD. CATEGORIA;CATEGORIA;FLAG SAU;CRITERIO DI MANTENIMENTO;BIOLOGICO;DATA INIZIO UTILIZZO;
 * DATA FINE UTILIZZO;SUPERFICIE(ha);...
 */

export interface EmiliaRomagnaColumnMapping {
  // Identificativi domanda
  idDomanda: string;
  anno: string;
  codStatoDomanda: string;
  statoDomanda: string;
  // Identificativi azienda
  cuaa: string;
  ragioneSociale: string;
  caa: string;
  caaLocale: string;
  // Identificativi particella
  idParticella: string;
  // Ubicazione
  codRegione: string;
  regione: string;
  provincia: string;
  comune: string;
  codNazionale: string;
  // Dati catastali
  foglio: string; // NOTA: ha uno spazio finale nel CSV originale "FOGLIO "
  particella: string;
  subalterno: string;
  // Caratteristiche terreno
  fasciaAltimetrica: string;
  irrigabilita: string;
  rotazioneColturale: string;
  // Date
  dataRiferimento: string;
  dataInizioUtilizzo: string;
  dataFineUtilizzo: string;
  // Isola/Appezzamento
  idIsola: string;
  idAppezzamento: string;
  // Coltura
  codColtura: string;
  codOccupazioneSuolo: string;
  occupazioneSuolo: string;
  codDestinazione: string;
  destinazione: string;
  codUso: string;
  uso: string;
  codQualita: string;
  qualita: string;
  codVarieta: string;
  varieta: string;
  codMacrouso: string;
  descMacrouso: string;
  codCategoria: string;
  categoria: string;
  // SAU e biologico
  flagSau: string;
  criterioMantenimento: string;
  biologico: string;
  // Superficie
  superficieHa: string;
  // Protezione e irrigazione
  tipSerra: string;
  tipSemina: string;
  tipProtezione: string;
  tipIrrigazione: string;
  // Impianto
  annoImpianto: string;
  sestoSuFila: string;
  sestoTraFila: string;
  tipImpianto: string;
  numPiante: string;
  densitaPiante: string;
  faseAllevamento: string;
  formaAllevamento: string;
}

/**
 * Default column mapping for Emilia-Romagna CSV format
 */
export const EMILIA_ROMAGNA_COLUMN_MAPPING: EmiliaRomagnaColumnMapping = {
  // Identificativi domanda
  idDomanda: 'ID. DOMANDA',
  anno: 'ANNO',
  codStatoDomanda: 'COD. STATO DOMANDA',
  statoDomanda: 'STATO DOMANDA',
  // Identificativi azienda
  cuaa: 'CUAA',
  ragioneSociale: 'RAGIONE SOCIALE',
  caa: 'CAA',
  caaLocale: 'CAA LOCALE',
  // Identificativi particella
  idParticella: 'ID. PARTICELLA',
  // Ubicazione
  codRegione: 'COD. REGIONE',
  regione: 'REGIONE',
  provincia: 'PROVINCIA',
  comune: 'COMUNE',
  codNazionale: 'COD. NAZIONALE',
  // Dati catastali - NOTA: "FOGLIO " ha uno spazio finale!
  foglio: 'FOGLIO ',
  particella: 'PARTICELLA',
  subalterno: 'SUBALTERNO',
  // Caratteristiche terreno
  fasciaAltimetrica: 'FASCIA ALTIMETRICA',
  irrigabilita: "IRRIGABILITA'",
  rotazioneColturale: 'ROT. COLTURALE',
  // Date
  dataRiferimento: 'DATA RIFERIMENTO',
  dataInizioUtilizzo: 'DATA INIZIO UTILIZZO',
  dataFineUtilizzo: 'DATA FINE UTILIZZO',
  // Isola/Appezzamento
  idIsola: 'ID. ISOLA',
  idAppezzamento: 'ID. APPEZZAMENTO',
  // Coltura
  codColtura: 'COD. COLTURA',
  codOccupazioneSuolo: 'COD. OCC. SUOLO',
  occupazioneSuolo: 'OCCUPAZIONE SUOLO',
  codDestinazione: 'COD. DEST.',
  destinazione: 'DESTINAZIONE',
  codUso: 'COD. USO',
  uso: 'USO',
  codQualita: 'COD. QUALITA',
  qualita: 'QUALITA',
  codVarieta: 'COD. VARIETA',
  varieta: 'VARIETA',
  codMacrouso: 'COD. MACROUSO',
  descMacrouso: 'DESC. MACROUSO',
  codCategoria: 'COD. CATEGORIA',
  categoria: 'CATEGORIA',
  // SAU e biologico
  flagSau: 'FLAG SAU',
  criterioMantenimento: 'CRITERIO DI MANTENIMENTO',
  biologico: 'BIOLOGICO',
  // Superficie
  superficieHa: 'SUPERFICIE(ha)',
  // Protezione e irrigazione
  tipSerra: 'TIP. SERRA',
  tipSemina: 'TIP. SEMINA',
  tipProtezione: 'TIP. PROTEZIONE',
  tipIrrigazione: 'TIP. IRRIGAZIONE',
  // Impianto
  annoImpianto: 'ANNO IMPIANTO',
  sestoSuFila: 'SESTO SU FILA',
  sestoTraFila: 'SESTO TRA FILA',
  tipImpianto: 'TIP. IMPIANTO',
  numPiante: 'NUM. PIANTE',
  densitaPiante: "DENSITA' PIANTE",
  faseAllevamento: 'FASE ALLEVAMENTO',
  formaAllevamento: 'FORMA ALLEVAMENTO',
};

/**
 * Check if the CSV headers match the Emilia-Romagna format
 */
export function isEmiliaRomagnaFormat(headers: string[]): boolean {
  const normalizedHeaders = headers.map((h) => h.trim().toUpperCase());

  // Colonne distintive del formato Emilia-Romagna AGEA
  const requiredColumns = [
    'CUAA',
    'RAGIONE SOCIALE',
    'REGIONE',
    'OCCUPAZIONE SUOLO',
    'SUPERFICIE(HA)',
  ];

  // Verifica che tutte le colonne richieste siano presenti
  const hasAllRequired = requiredColumns.every((col) =>
    normalizedHeaders.some((h) => h === col || h.includes(col)),
  );

  // Verifica colonne specifiche che distinguono da altri formati
  const hasEmiliaSpecific =
    normalizedHeaders.some((h) => h === 'ID. DOMANDA' || h.includes('ID. DOMANDA')) ||
    normalizedHeaders.some((h) => h === 'FLAG SAU' || h.includes('FLAG SAU')) ||
    normalizedHeaders.some((h) => h === 'COD. OCC. SUOLO' || h.includes('COD. OCC. SUOLO'));

  return hasAllRequired && hasEmiliaSpecific;
}

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
