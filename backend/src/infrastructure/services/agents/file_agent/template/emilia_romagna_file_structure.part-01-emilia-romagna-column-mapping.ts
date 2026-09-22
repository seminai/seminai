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
