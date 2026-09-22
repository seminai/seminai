/**
 * CIA Schedario Viticolo (Old B1) File Structure Template
 *
 * This template defines the column mapping for vineyard cadastral registry files
 * exported from the CIA's Schedario Viticolo system (old B1 format).
 *
 * Characteristics:
 * - Each row is a UNAR (sub-unit within a cadastral parcel)
 * - All rows are vineyard land (Vite)
 * - Grape variety (DESCRIZIONE VITIGNO) differentiates production units
 * - Surfaces are in square meters (MQ)
 * - Dates are Excel serial numbers or formatted dates
 *
 * Example CSV header:
 * ANOMALIE;PROVINCIA;COMUNE;SEZIONE;FOGLIO;PARTICELLA;UNAR;SUPERFICIE CATASTALE;
 * SUPERFICIE GIS;SUP. VITATA DICHIARATA;SESTO SU FILA;SESTO TRA FILA;NUMERO CEPPI;
 * DENSITA;FORMA ALLEVAMENTO;IRRIGAZIONE;ANNO IMPIANTO;DESCRIZIONE VITIGNO;
 * CODICE VITIGNO;ALTEZZA;PENDENZA;DATA CESSAZIONE;DATA RILIEVO;UTENTE;DATA AGGIORNAMENTO
 */

export interface CiaSchedarioViticoloColumnMapping {
  anomalie: string;
  provincia: string;
  comune: string;
  sezione: string;
  foglio: string;
  particella: string;
  unar: string;
  superficieCatastale: string;
  superficieGis: string;
  supVitataDichiarata: string;
  sestoSuFila: string;
  sestoTraFila: string;
  numeroCeppi: string;
  densita: string;
  formaAllevamento: string;
  irrigazione: string;
  annoImpianto: string;
  descrizioneVitigno: string;
  codiceVitigno: string;
  altezza: string;
  pendenza: string;
  dataCessazione: string;
  dataRilievo: string;
  utente: string;
  dataAggiornamento: string;
}

/**
 * Default column mapping for CIA Schedario Viticolo format
 */
export const CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING: CiaSchedarioViticoloColumnMapping = {
  anomalie: 'ANOMALIE',
  provincia: 'PROVINCIA',
  comune: 'COMUNE',
  sezione: 'SEZIONE',
  foglio: 'FOGLIO',
  particella: 'PARTICELLA',
  unar: 'UNAR',
  superficieCatastale: 'SUPERFICIE CATASTALE',
  superficieGis: 'SUPERFICIE GIS',
  supVitataDichiarata: 'SUP. VITATA DICHIARATA',
  sestoSuFila: 'SESTO SU FILA',
  sestoTraFila: 'SESTO TRA FILA',
  numeroCeppi: 'NUMERO CEPPI',
  densita: 'DENSITA',
  formaAllevamento: 'FORMA ALLEVAMENTO',
  irrigazione: 'IRRIGAZIONE',
  annoImpianto: 'ANNO IMPIANTO',
  descrizioneVitigno: 'DESCRIZIONE VITIGNO',
  codiceVitigno: 'CODICE VITIGNO',
  altezza: 'ALTEZZA',
  pendenza: 'PENDENZA',
  dataCessazione: 'DATA CESSAZIONE',
  dataRilievo: 'DATA RILIEVO',
  utente: 'UTENTE',
  dataAggiornamento: 'DATA AGGIORNAMENTO',
};

/**
 * Detect if the headers match the CIA Schedario Viticolo format.
 * Checks for distinctive headers that uniquely identify this format.
 */
export function isCiaSchedarioViticoloFormat(headers: string[]): boolean {
  const headerLower = headers.map((h) => h.toLowerCase().trim());

  // Distinctive headers for this format
  const distinctiveHeaders = [
    'unar',
    'descrizione vitigno',
    'forma allevamento',
    'sup. vitata dichiarata',
    'codice vitigno',
    'numero ceppi',
  ];

  const matches = distinctiveHeaders.filter((dh) => headerLower.some((h) => h.includes(dh))).length;

  // Need at least 3 distinctive matches
  return matches >= 3;
}

/**
 * Parse a number from string, handling Italian decimal format (comma as separator).
 * Returns null if the value is not a valid number.
 */
export function parseCiaNumber(value: string | undefined | null): number | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const cleaned = str.replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse a date from Excel serial number or formatted date string.
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
export function parseCiaDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Try YYYY-MM-DD format (from cellDates: true)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Try DD/MM/YYYY format
  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // Try Excel serial number (number > 30000 means a date far in the future or past)
  const numValue = parseFloat(str);
  if (!isNaN(numValue) && numValue > 1000 && numValue < 3000000) {
    // Excel epoch: Jan 1, 1900 (with the infamous Feb 29, 1900 bug)
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    const date = new Date(excelEpoch.getTime() + numValue * 86400000);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      // Skip dates far in the future (cessation dates set to 9999 etc.)
      if (year > 2100) return null;
      return `${year}-${month}-${day}`;
    }
  }

  // Try Date parsing as fallback
  try {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      if (year > 2100) return null;
      return date.toISOString().split('T')[0];
    }
  } catch {
    // Ignore
  }

  return null;
}
