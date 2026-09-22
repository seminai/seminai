/**
 * Piemonte CSV File Structure Template
 *
 * This template defines the column mapping for agricultural field CSV files
 * from Piemonte region (SATA/SIAN format).
 *
 * Example CSV header:
 * Unita produttiva;Comune Istat;Comune Descrizione;Sezione;Foglio;Particella;Subalterno;
 * Superficie Catastale;Superficie Grafica;Conduzione TC;Conduzione Percent;Superficie Agricola;
 * Superficie Eleggibile;Superficie Eleggibile Netta;Registri;CP;Irr;
 * Occupazione Suolo Uso Suolo Primario;Destinazione Uso Suolo Primario;Uso Uso Suolo Primario;
 * Qualita Uso Suolo Primario;Varieta Uso Suolo Primario;Superficie Uso Suolo Primario;
 * Superficie Netta Uso Suolo Primario;Epoca Semina Primario;Tipo Semina Primario;
 * Data inizio Semina Primario;Data fine Semina Primario;...
 */

export interface PiemonteColumnMapping {
  // Identificativi azienda/unità produttiva
  unitaProduttiva: string;
  // Ubicazione
  comuneIstat: string;
  comuneDescrizione: string;
  // Dati catastali
  sezione: string;
  foglio: string;
  particella: string;
  subalterno: string;
  // Superfici (tutte in HA)
  superficieCatastale: string;
  superficieGrafica: string;
  superficieAgricola: string;
  superficieEleggibile: string;
  superficieEleggibileNetta: string;
  // Conduzione
  conduzioneTC: string;
  conduzionePercent: string;
  // Registri e codici
  registri: string;
  cp: string;
  irr: string;
  // Uso del suolo primario
  occupazioneSuoloPrimario: string;
  destinazionePrimario: string;
  usoPrimario: string;
  qualitaPrimario: string;
  varietaPrimario: string;
  superficiePrimario: string;
  superficieNettaPrimario: string;
  epocaSeminaPrimario: string;
  tipoSeminaPrimario: string;
  dataInizioSeminaPrimario: string;
  dataFineSeminaPrimario: string;
  // Uso del suolo secondario
  occupazioneSuoloSecondario: string;
  destinazioneSecondario: string;
  usoSecondario: string;
  qualitaSecondario: string;
  varietaSecondario: string;
  superficieSecondario: string;
  superficieNettaSecondario: string;
  epocaSeminaSecondario: string;
  tipoSeminaSecondario: string;
  dataInizioSeminaSecondario: string;
  dataFineSeminaSecondario: string;
  // Mantenimento e allevamento
  mantenimento: string;
  allevamento: string;
  // Elementi caratteristici paesaggio
  tipoElementiPaesaggio: string;
  valoreElementiPaesaggio: string;
  unitaMisuraElementiPaesaggio: string;
  valoreEttariElementiPaesaggio: string;
  valoreValidoControlloElementiPaesaggio: string;
  // Biologico
  bioBiologico: string;
  convenzionaleBiologico: string;
  inConversioneBiologico: string;
  derogaInizialeBiologico: string;
  derogaFinaleBiologico: string;
  // Impianto
  numPianteImpianto: string;
  annoImpianto: string;
  // Caratteristiche terreno
  zonaAlt: string;
  potenzialitaIrrigua: string;
  rotazioneColturale: string;
  // Documento e note
  documento: string;
  note: string;
  notifica: string;
  // Conduttore
  conduttore: string;
  azCondAsservimento: string;
  // Identificativi AGEA
  idAppezzamentoAgea: string;
  idAppezzamento: string;
  idIsola: string;
  codiceIsola: string;
  // Zone
  zonaVulnerabileNitrati: string;
}

/**
 * Default column mapping for Piemonte CSV format
 */
export const PIEMONTE_COLUMN_MAPPING: PiemonteColumnMapping = {
  // Identificativi
  unitaProduttiva: 'Unita produttiva',
  // Ubicazione
  comuneIstat: 'Comune Istat',
  comuneDescrizione: 'Comune Descrizione',
  // Dati catastali
  sezione: 'Sezione',
  foglio: 'Foglio',
  particella: 'Particella',
  subalterno: 'Subalterno',
  // Superfici (in HA)
  superficieCatastale: 'Superficie Catastale',
  superficieGrafica: 'Superficie Grafica',
  superficieAgricola: 'Superficie Agricola',
  superficieEleggibile: 'Superficie Eleggibile',
  superficieEleggibileNetta: 'Superficie Eleggibile Netta',
  // Conduzione
  conduzioneTC: 'Conduzione TC',
  conduzionePercent: 'Conduzione Percent',
  // Registri
  registri: 'Registri',
  cp: 'CP',
  irr: 'Irr',
  // Uso suolo primario
  occupazioneSuoloPrimario: 'Occupazione Suolo Uso Suolo Primario',
  destinazionePrimario: 'Destinazione Uso Suolo Primario',
  usoPrimario: 'Uso Uso Suolo Primario',
  qualitaPrimario: 'Qualita Uso Suolo Primario',
  varietaPrimario: 'Varieta Uso Suolo Primario',
  superficiePrimario: 'Superficie Uso Suolo Primario',
  superficieNettaPrimario: 'Superficie Netta Uso Suolo Primario',
  epocaSeminaPrimario: 'Epoca Semina Primario',
  tipoSeminaPrimario: 'Tipo Semina Primario',
  dataInizioSeminaPrimario: 'Data inizio Semina Primario',
  dataFineSeminaPrimario: 'Data fine Semina Primario',
  // Uso suolo secondario
  occupazioneSuoloSecondario: 'Occupazione suolo Uso Suolo Secondario',
  destinazioneSecondario: 'Destinazione Uso Suolo Secondario',
  usoSecondario: 'Uso Uso Suolo Secondario',
  qualitaSecondario: 'Qualita Uso Suolo Secondario',
  varietaSecondario: 'Varieta Uso Suolo Secondario',
  superficieSecondario: 'Sup Uso Suolo Secondario',
  superficieNettaSecondario: 'Sup Netta Uso Suolo Secondario',
  epocaSeminaSecondario: 'Epoca Semina Secondario',
  tipoSeminaSecondario: 'Tipo Semina Secondario',
  dataInizioSeminaSecondario: 'Data inizio Semina Secondario',
  dataFineSeminaSecondario: 'Data fine Semina Secondario',
  // Mantenimento e allevamento
  mantenimento: 'Mantenimento',
  allevamento: 'Allevamento',
  // Elementi paesaggio
  tipoElementiPaesaggio: 'Tipo Elementi caratteristici paesaggio',
  valoreElementiPaesaggio: 'Valore Elementi caratteristici paesaggio',
  unitaMisuraElementiPaesaggio: 'Unita di misura Elementi caratteristici paesaggio',
  valoreEttariElementiPaesaggio: 'Valore in ettari Elementi caratteristici paesaggio',
  valoreValidoControlloElementiPaesaggio:
    'Valore valido per il controllo Elementi caratteristici paesaggio',
  // Biologico
  bioBiologico: 'Bio Biologico',
  convenzionaleBiologico: 'Convenzionale Biologico',
  inConversioneBiologico: 'In conversione Biologico',
  derogaInizialeBiologico: 'Deroga iniziale Biologico',
  derogaFinaleBiologico: 'Deroga finale Biologico',
  // Impianto
  numPianteImpianto: 'Num piante Impianto',
  annoImpianto: 'Anno Impianto',
  // Caratteristiche terreno
  zonaAlt: 'Zona Alt',
  potenzialitaIrrigua: 'Potenzialita irrigua',
  rotazioneColturale: 'Rotazione colturale',
  // Documento e note
  documento: 'Documento',
  note: 'Note',
  notifica: 'Notifica',
  // Conduttore
  conduttore: 'Conduttore',
  azCondAsservimento: 'Az cond asservimento',
  // AGEA
  idAppezzamentoAgea: 'Id appezzamento AGEA',
  idAppezzamento: 'Id appezzamento',
  idIsola: 'Id isola',
  codiceIsola: 'Codice isola',
  // Zone
  zonaVulnerabileNitrati: 'Zona Vulnerabile Nitrati vigenti',
};

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

/**
 * Get region name from provincia code
 */
export function getRegioneFromProvincia(provincia: string): string {
  const prov = provincia?.toUpperCase().trim();

  // Piemonte provinces
  const piemonteProvinces = ['AL', 'AT', 'BI', 'CN', 'NO', 'TO', 'VB', 'VC'];
  if (piemonteProvinces.includes(prov)) {
    return 'PIEMONTE';
  }

  // Emilia-Romagna provinces
  const emiliaRomagnaProvinces = ['BO', 'FE', 'FC', 'MO', 'PR', 'PC', 'RA', 'RE', 'RN'];
  if (emiliaRomagnaProvinces.includes(prov)) {
    return 'EMILIA ROMAGNA';
  }

  // Lombardia provinces
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
  if (lombardiaProvinces.includes(prov)) {
    return 'LOMBARDIA';
  }

  return 'ITALIA';
}

/**
 * Known comuni in Emilia-Romagna (commonly found in agricultural data)
 */
const EMILIA_ROMAGNA_COMUNI = new Set([
  'ALFONSINE',
  'ARGENTA',
  'BAGNACAVALLO',
  'BAGNARA DI ROMAGNA',
  'BERTINORO',
  'BOLOGNA',
  'BONDENO',
  'BRISIGHELLA',
  'BUDRIO',
  'CASOLA VALSENIO',
  'CASTEL BOLOGNESE',
  'CASTEL GUELFO DI BOLOGNA',
  'CASTEL SAN PIETRO TERME',
  'CASTELLARANO',
  'CASTROCARO TERME E TERRA DEL SOLE',
  'CERVIA',
  'CESENA',
  'CESENATICO',
  'CODIGORO',
  'COMACCHIO',
  'CONSELICE',
  'COTIGNOLA',
  'FAENZA',
  'FERRARA',
  'FORLI',
  'FORLIMPOPOLI',
  'FUSIGNANO',
  'GAMBETTOLA',
  'IMOLA',
  'LUGO',
  'MASSA LOMBARDA',
  'MEDICINA',
  'MODENA',
  'MOLINELLA',
  'MORDANO',
  'OSTELLATO',
  'PARMA',
  'PIACENZA',
  'RAVENNA',
  'REGGIO EMILIA',
  'RIOLO TERME',
  'RIMINI',
  'RUSSI',
  "SANT'AGATA SUL SANTERNO",
  'SOLAROLO',
  'SASSO MARCONI',
  'SAN LAZZARO DI SAVENA',
]);

/**
 * Get region name from comune name (when provincia is not available)
 */
export function getRegioneFromComune(comune: string): string | null {
  if (!comune) return null;

  const comuneUpper = comune.toUpperCase().trim();

  if (EMILIA_ROMAGNA_COMUNI.has(comuneUpper)) {
    return 'EMILIA ROMAGNA';
  }

  return null;
}

/**
 * Parse epoca semina to determine planting season
 */
export function parseEpocaSemina(epocaSemina: string): 'autumn-winter' | 'spring-summer' | null {
  if (!epocaSemina) return null;

  const upper = epocaSemina.toUpperCase().trim();

  if (upper.includes('AUTUNNO') || upper.includes('INVERNO')) {
    return 'autumn-winter';
  }
  if (upper.includes('PRIMAVERA') || upper.includes('ESTATE')) {
    return 'spring-summer';
  }

  return null;
}

/**
 * Parse tipo semina
 */
export function parseTipoSemina(tipoSemina: string): string | null {
  if (!tipoSemina || tipoSemina.trim() === '' || tipoSemina.includes('NON PREVISTO')) {
    return null;
  }
  return tipoSemina.trim();
}

/**
 * Parse zona altimetrica
 */
export function parseZonaAltimetrica(zonaAlt: string): 'pianura' | 'collina' | 'montagna' | null {
  if (!zonaAlt) return null;

  const lower = zonaAlt.toLowerCase().trim();

  if (lower.includes('pianura')) return 'pianura';
  if (lower.includes('collina')) return 'collina';
  if (lower.includes('montagna')) return 'montagna';

  return null;
}

/**
 * Check if particella is irrigable
 */
export function isIrrigable(potenzialitaIrrigua: string): boolean {
  if (!potenzialitaIrrigua) return false;
  const lower = potenzialitaIrrigua.toLowerCase();
  return !lower.includes('non irrigua');
}

/**
 * Parse rotazione colturale type
 */
export function parseRotazioneColturale(
  rotazione: string,
): 'seminativo' | 'senza_rotazione' | null {
  if (!rotazione) return null;

  const lower = rotazione.toLowerCase();

  if (lower.includes('ciclo seminativo')) {
    return 'seminativo';
  }
  if (lower.includes('senza rotazione')) {
    return 'senza_rotazione';
  }

  return null;
}
