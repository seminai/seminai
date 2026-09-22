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

/**
 * Get the region name from a province name.
 * This format provides full province names (e.g., "MODENA", "BOLOGNA").
 */
export function getRegioneFromProvincia(provincia: string): string | null {
  if (!provincia) return null;
  const prov = provincia.toUpperCase().trim();

  const provinciaToRegione: Record<string, string> = {
    // Emilia-Romagna
    BOLOGNA: 'EMILIA-ROMAGNA',
    FERRARA: 'EMILIA-ROMAGNA',
    'FORLI-CESENA': 'EMILIA-ROMAGNA',
    MODENA: 'EMILIA-ROMAGNA',
    PARMA: 'EMILIA-ROMAGNA',
    PIACENZA: 'EMILIA-ROMAGNA',
    RAVENNA: 'EMILIA-ROMAGNA',
    "REGGIO NELL'EMILIA": 'EMILIA-ROMAGNA',
    'REGGIO EMILIA': 'EMILIA-ROMAGNA',
    RIMINI: 'EMILIA-ROMAGNA',
    // Piemonte
    TORINO: 'PIEMONTE',
    ALESSANDRIA: 'PIEMONTE',
    ASTI: 'PIEMONTE',
    BIELLA: 'PIEMONTE',
    CUNEO: 'PIEMONTE',
    NOVARA: 'PIEMONTE',
    VERBANIA: 'PIEMONTE',
    VERCELLI: 'PIEMONTE',
    // Lombardia
    MILANO: 'LOMBARDIA',
    BERGAMO: 'LOMBARDIA',
    BRESCIA: 'LOMBARDIA',
    COMO: 'LOMBARDIA',
    CREMONA: 'LOMBARDIA',
    LECCO: 'LOMBARDIA',
    LODI: 'LOMBARDIA',
    MANTOVA: 'LOMBARDIA',
    'MONZA E BRIANZA': 'LOMBARDIA',
    PAVIA: 'LOMBARDIA',
    SONDRIO: 'LOMBARDIA',
    VARESE: 'LOMBARDIA',
    // Veneto
    VENEZIA: 'VENETO',
    VERONA: 'VENETO',
    VICENZA: 'VENETO',
    PADOVA: 'VENETO',
    TREVISO: 'VENETO',
    ROVIGO: 'VENETO',
    BELLUNO: 'VENETO',
    // Trentino-Alto Adige
    TRENTO: 'TRENTINO-ALTO ADIGE',
    BOLZANO: 'TRENTINO-ALTO ADIGE',
    // Friuli-Venezia Giulia
    TRIESTE: 'FRIULI VENEZIA GIULIA',
    GORIZIA: 'FRIULI VENEZIA GIULIA',
    PORDENONE: 'FRIULI VENEZIA GIULIA',
    UDINE: 'FRIULI VENEZIA GIULIA',
    // Toscana
    FIRENZE: 'TOSCANA',
    AREZZO: 'TOSCANA',
    GROSSETO: 'TOSCANA',
    LIVORNO: 'TOSCANA',
    LUCCA: 'TOSCANA',
    MASSA: 'TOSCANA',
    PISA: 'TOSCANA',
    PISTOIA: 'TOSCANA',
    PRATO: 'TOSCANA',
    SIENA: 'TOSCANA',
    // Lazio
    ROMA: 'LAZIO',
    FROSINONE: 'LAZIO',
    LATINA: 'LAZIO',
    RIETI: 'LAZIO',
    VITERBO: 'LAZIO',
    // Campania
    NAPOLI: 'CAMPANIA',
    AVELLINO: 'CAMPANIA',
    BENEVENTO: 'CAMPANIA',
    CASERTA: 'CAMPANIA',
    SALERNO: 'CAMPANIA',
    // Puglia
    BARI: 'PUGLIA',
    BRINDISI: 'PUGLIA',
    FOGGIA: 'PUGLIA',
    LECCE: 'PUGLIA',
    TARANTO: 'PUGLIA',
    // Sicilia
    PALERMO: 'SICILIA',
    AGRIGENTO: 'SICILIA',
    CALTANISSETTA: 'SICILIA',
    CATANIA: 'SICILIA',
    ENNA: 'SICILIA',
    MESSINA: 'SICILIA',
    RAGUSA: 'SICILIA',
    SIRACUSA: 'SICILIA',
    TRAPANI: 'SICILIA',
    // Sardegna
    CAGLIARI: 'SARDEGNA',
    NUORO: 'SARDEGNA',
    ORISTANO: 'SARDEGNA',
    SASSARI: 'SARDEGNA',
    // Abruzzo
    "L'AQUILA": 'ABRUZZO',
    CHIETI: 'ABRUZZO',
    PESCARA: 'ABRUZZO',
    TERAMO: 'ABRUZZO',
    // Marche
    ANCONA: 'MARCHE',
    ASCOLI: 'MARCHE',
    FERMO: 'MARCHE',
    MACERATA: 'MARCHE',
    PESARO: 'MARCHE',
    // Umbria
    PERUGIA: 'UMBRIA',
    TERNI: 'UMBRIA',
    // Calabria
    CATANZARO: 'CALABRIA',
    COSENZA: 'CALABRIA',
    CROTONE: 'CALABRIA',
    'REGGIO CALABRIA': 'CALABRIA',
    'VIBO VALENTIA': 'CALABRIA',
    // Basilicata
    POTENZA: 'BASILICATA',
    MATERA: 'BASILICATA',
    // Molise
    CAMPOBASSO: 'MOLISE',
    ISERNIA: 'MOLISE',
    // Liguria
    GENOVA: 'LIGURIA',
    IMPERIA: 'LIGURIA',
    SAVONA: 'LIGURIA',
    'LA SPEZIA': 'LIGURIA',
    // Valle d'Aosta
    AOSTA: "VALLE D'AOSTA",
  };

  return provinciaToRegione[prov] || null;
}

/**
 * Normalize grape variety name.
 * Cleans up names like "LAMBRUSCO SALAMINO N." -> "Lambrusco Salamino"
 * The trailing letter (N., B., Rs., etc.) is the grape color code.
 */
export function normalizeVitignoName(vitigno: string): {
  name: string;
  colorCode: string | null;
} {
  if (!vitigno) return { name: '', colorCode: null };

  const trimmed = vitigno.trim();

  // Match trailing color code: N. (nero), B. (bianco), Rs. (rosato/rosé), G. (grigio)
  const colorMatch = trimmed.match(/\s+(N\.|B\.|Rs\.|G\.|R\.)$/i);
  let colorCode: string | null = null;
  let name = trimmed;

  if (colorMatch) {
    colorCode = colorMatch[1].replace('.', '').toUpperCase();
    name = trimmed.slice(0, -colorMatch[0].length).trim();
  }

  // Title case the name
  name = name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return { name, colorCode };
}
