/**
 * Veneto CSV File Structure Template
 *
 * This template defines the column mapping for agricultural field CSV files
 * from Veneto region (similar to Piemonte SATA/SIAN format).
 *
 * Example CSV header based on 'campi_elisa Adami.xlsx':
 * Contains columns like "Superficie Uso Suolo Primario" for SAU calculation
 */

export interface VenetoColumnMapping {
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
 * Default column mapping for Veneto CSV format
 */
export const VENETO_COLUMN_MAPPING: VenetoColumnMapping = {
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
 * Get region name from provincia code (Veneto provinces)
 */
export function getRegioneFromProvincia(provincia: string): string {
  const prov = provincia?.toUpperCase().trim();

  // Veneto provinces
  const venetoProvinces = ['VR', 'VI', 'VE', 'PD', 'TV', 'RO', 'BL'];
  if (venetoProvinces.includes(prov)) {
    return 'VENETO';
  }

  return 'ITALIA';
}

/**
 * Get region name from comune name (Veneto comuni)
 */
export function getRegioneFromComune(comune: string): string | null {
  if (!comune) return null;

  const comuneUpper = comune.toUpperCase().trim();

  // Common Veneto comuni
  const venetoComuni = new Set([
    'VERONA',
    'VENEZIA',
    'PADOVA',
    'VICENZA',
    'TREVISO',
    'ROVIGO',
    'BELLUNO',
    'BASSANO DEL GRAPPA',
    'CONEGLIANO',
    'JESOLO',
    'CHIOGGIA',
    'SAN DONA DI PIAVE',
    'MONTEBELLUNA',
    'CASTELFRANCO VENETO',
    'SCHIO',
    'MESTRE',
    'LEGNAGO',
    'VILLAFRANCA DI VERONA',
    'ABANO TERME',
    'ESTE',
    'MONTAGNANA',
  ]);

  if (venetoComuni.has(comuneUpper)) {
    return 'VENETO';
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

// ============================================================================
// VENETO AVEPA "Piano Utilizzo" Format
// ============================================================================

/**
 * Column mapping for Veneto AVEPA "Piano Utilizzo" format
 *
 * This format is used by AVEPA (Agenzia Veneta per i Pagamenti) and has:
 * - Multi-row header with title, year, and status
 * - Column headers starting at row 22
 * - PAC AGEA codes in columns W-X
 *
 * Example file: "campi_elisa Adami.xls"
 */
export interface VenetoAVEPAColumnMapping {
  // Ubicazione
  comune: string;
  // Dati catastali
  sezione: string;
  foglio: string;
  particella: string;
  subalterno: string;
  // Superfici
  superficieCatastale: string;
  // Irrigazione
  potenzialitaIrrigua: string;
  // Ciclo
  presenzaCiclo: string;
  tipoCon: string;
  superficieCondotta: string;
  // Identificativi parcella
  parcellaRif: string;
  // Codice PAC AGEA (colonna con codice tipo 870-011-000-000-000)
  codicePacAgea: string;
  // Coltura
  primaColtura: string;
  // Caratteristiche
  serra: string;
  bio: string;
  // Superficie utilizzata
  superficieUtilizzata: string;
}

/**
 * Default column mapping for Veneto AVEPA "Piano Utilizzo" format
 */
export const VENETO_AVEPA_COLUMN_MAPPING: VenetoAVEPAColumnMapping = {
  // Ubicazione
  comune: 'Comune',
  // Dati catastali
  sezione: 'Sez',
  foglio: 'Fog.',
  particella: 'Part.',
  subalterno: 'Sub',
  // Superfici
  superficieCatastale: 'Sup. Catastale',
  // Irrigazione
  potenzialitaIrrigua: 'Potenz. irriguo',
  // Ciclo
  presenzaCiclo: 'Presenza ciclo',
  tipoCon: 'Tipo Con',
  superficieCondotta: 'Sup. Condotta',
  // Identificativi parcella
  parcellaRif: 'Parcella di rif.',
  // Codice PAC AGEA - this is typically in columns W-X
  // The actual column name might vary, we'll detect it
  codicePacAgea: '',
  // Coltura
  primaColtura: '1a Coltura',
  // Caratteristiche
  serra: 'Serra',
  bio: 'Bio',
  // Superficie utilizzata
  superficieUtilizzata: 'Sup. Utilizzata',
};

/**
 * Metadata extracted from Piano Utilizzo header
 */
export interface PianoUtilizzoMetadata {
  campagna: string | null;
  stato: string | null;
}

/**
 * Check if the file is a Veneto AVEPA "Piano Utilizzo" format
 * Looks for characteristic patterns in the first rows
 */
export function isVenetoAVEPAFormat(headers: string[], rawRows?: string[][]): boolean {
  // Check if headers contain characteristic columns
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

  const avepaColumns = ['comune', 'sup. catastale', '1a coltura', 'sup. utilizzata'];

  const hasAvepaColumns = avepaColumns.every((col) =>
    normalizedHeaders.some((h) => h.includes(col) || col.includes(h)),
  );

  // Check for PAC code pattern in headers or data (columns with parentheses like "(870-011-000-000-000)")
  const hasPacPattern =
    normalizedHeaders.some((h) => /\d{3}-\d{3}-\d{3}/.test(h)) ||
    headers.some((h) => /^\(\d{3}-\d{3}/.test(h.trim()));

  // Check raw rows for Piano Utilizzo signature
  if (rawRows && rawRows.length > 0) {
    const firstRows = rawRows.slice(0, 25).map((row) => row.join(' ').toLowerCase());
    const hasPianoUtilizzo = firstRows.some(
      (row) => row.includes('piano utilizzo') || row.includes('avepa'),
    );
    if (hasPianoUtilizzo) {
      return true;
    }
  }

  return hasAvepaColumns || hasPacPattern;
}

/**
 * Extract metadata from Piano Utilizzo header rows
 */
export function extractPianoUtilizzoMetadata(rawRows: string[][]): PianoUtilizzoMetadata {
  const metadata: PianoUtilizzoMetadata = {
    campagna: null,
    stato: null,
  };

  // Search in first 25 rows for Campagna and Stato
  for (let i = 0; i < Math.min(25, rawRows.length); i++) {
    const row = rawRows[i];
    const rowText = row.join(' ');

    // Look for Campagna (year)
    if (rowText.toLowerCase().includes('campagna')) {
      const yearMatch = rowText.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        metadata.campagna = yearMatch[1];
      }
    }

    // Look for Stato
    if (rowText.toLowerCase().includes('stato')) {
      const statoMatch = rowText.match(/stato[:\s]*([\w\s]+)/i);
      if (statoMatch) {
        metadata.stato = statoMatch[1].trim();
      }
    }
  }

  return metadata;
}

/**
 * Find the header row index in Piano Utilizzo format
 * Headers are typically after the metadata rows (around row 22)
 */
export function findAVEPAHeaderRowIndex(rawRows: string[][]): number {
  // Look for row containing "Comune" and "Foglio" or "Fog."
  for (let i = 15; i < Math.min(30, rawRows.length); i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const rowText = row.map((c) => String(c).toLowerCase()).join('|');

    // Check for characteristic header columns
    const hasComune = rowText.includes('comune');
    const hasFoglio = rowText.includes('fog') || rowText.includes('foglio');
    const hasColtura = rowText.includes('coltura') || rowText.includes('1a coltura');

    if (hasComune && (hasFoglio || hasColtura)) {
      return i;
    }
  }

  // Fallback: assume row 21 (0-indexed) which is row 22 in Excel
  return 21;
}

/**
 * Parse PAC code from column value
 * Handles formats like "(870-011-000-000-000)" or "870-011-000-000-000"
 */
export function parsePacCodeFromColumn(value: string): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  // Match PAC code pattern with or without parentheses
  const match = trimmed.match(/\(?(\d{3}-\d{3}-\d{3}-\d{3}-\d{3})\)?/);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Parse "1a Coltura" column to extract crop name
 * Example: "ORZO - FAVE, SEMI, GRANELLA - ORZO" -> { name: "ORZO", fullDescription: "..." }
 */
export function parsePrimaColturaColumn(primaColtura: string): {
  name: string;
  fullDescription: string;
} {
  if (!primaColtura) {
    return { name: '', fullDescription: '' };
  }

  const trimmed = primaColtura.trim();

  // Split by " - " and take first part as main name
  const parts = trimmed.split(' - ').map((p) => p.trim());
  const name = parts[0] || trimmed;

  return {
    name,
    fullDescription: trimmed,
  };
}

/**
 * Parse superficie from AVEPA "Piano Utilizzo" format (handles Italian number format).
 * AVEPA format values are ALWAYS in MQ (square meters), so we always divide by 10000.
 * Example: "32278" -> 3.2278 (32278 MQ = 3.2278 HA)
 * Example: "42" -> 0.0042 (42 MQ = 0.0042 HA)
 */
export function parseAVEPASuperficie(value: string | number): number | null {
  if (value === null || value === undefined || value === '') return null;

  let numValue: number;

  if (typeof value === 'number') {
    numValue = value;
  } else {
    // Replace comma with dot for parsing
    const cleaned = value.trim().replace(',', '.');
    numValue = parseFloat(cleaned);
  }

  if (isNaN(numValue)) return null;

  // AVEPA "Piano Utilizzo" format values are ALWAYS in MQ (square meters)
  return numValue / 10000;
}

/**
 * Check if a row from AVEPA format is valid (not empty, has required data)
 */
export function isValidAVEPARow(row: Record<string, string>): boolean {
  // Must have at least comune and some superficie
  const hasComune = !!(row['Comune'] || row['comune']);
  const hasSuperficie = !!(
    row['Sup. Utilizzata'] ||
    row['sup. utilizzata'] ||
    row['Sup. Catastale'] ||
    row['sup. catastale']
  );

  return hasComune && hasSuperficie;
}

/**
 * Check if AVEPA row represents non-agricultural use
 */
export function isAVEPANonAgriculturalUse(primaColtura: string): boolean {
  if (!primaColtura) return false;

  const upper = primaColtura.toUpperCase();
  return (
    upper.includes('USO NON AGRICOLO') ||
    upper.includes('TARE') ||
    upper.includes('FABBRICATI') ||
    upper.includes('FOSSATI') ||
    upper.includes('MANUFATTI') ||
    upper.includes('OVERLAPPING') ||
    upper === 'OVERLAPPING'
  );
}

/**
 * Get PAC code column index from AVEPA format
 * The PAC code is typically in a column containing values like "(870-011-000-000-000)"
 */
export function findPacCodeColumnIndex(headers: string[], sampleRow: string[]): number {
  // First, check headers for PAC pattern
  for (let i = 0; i < headers.length; i++) {
    if (/\d{3}-\d{3}/.test(headers[i])) {
      return i;
    }
  }

  // Check sample row for PAC pattern
  for (let i = 0; i < sampleRow.length; i++) {
    const value = String(sampleRow[i] || '');
    if (/\(\d{3}-\d{3}-\d{3}-\d{3}-\d{3}\)/.test(value)) {
      return i;
    }
  }

  // Default: columns W-X are typically indices 22-23 in Excel
  return 22;
}
