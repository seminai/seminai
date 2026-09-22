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
