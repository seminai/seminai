/**
 * Types for BDF (Banca Dati Fitofarmaci) WS API integration
 */

// ============================================================
// Auth
// ============================================================

export interface BdfAuthResponse {
  success: boolean;
  access_token: string;
}

// ============================================================
// Avversità
// ============================================================

export interface BdfAvversita {
  COD_AVVERSITA: string;
  NOME_ITA: string;
}

// ============================================================
// Distributori
// ============================================================

export interface BdfDistributore {
  RAGIONE_SOCIALE: string;
  URL_CATALOGO: string | null;
  COD_PRODOTTO: string;
  WEB1: string | null;
}

// ============================================================
// Sostanza Attiva (dettaglio)
// ============================================================

export interface BdfSostanzaAttivaDati {
  CODICE: string;
  DECODIFICA: string;
  BIOLOGICO: boolean;
  SC_GENERALE: string | null;
  SC_ASP_APP: string | null;
  MECCANISMO_AZIONE: string | null;
  SC_ASP_LEG: string | null;
  PROP_CHIMICO_FISICHE: string | null;
}

// ============================================================
// Impieghi (colture autorizzate per prodotto)
// ============================================================

export interface BdfImpiego {
  TIPO: string;
  NOME: string;
  CARENZA: string;
  COLORE: string;
}

// ============================================================
// Sostanze Attive (lista)
// ============================================================

export interface BdfSostanzaAttiva {
  CODICE: string;
  DECODIFICA: string;
  BIOLOGICO: boolean;
  TIPOLOGIA: string;
  GRUPPO_CHIMICO: string;
  REVOCATO: boolean;
  SCORTE: boolean | null;
}

// ============================================================
// Composizione
// ============================================================

export interface BdfComposizione {
  COD_PR: string;
  COD_PA: string;
  PERCENTUALE: number | null;
  GRAMMI_LITRO: number | null;
  DECODIFICA: string;
}

// ============================================================
// Prodotto (lista)
// ============================================================

export interface BdfProdotto {
  COD_PRODOTTO: string;
  NOME_COMMERCIALE: string;
  IN_VENDITA: boolean;
  BIO: boolean;
  NUM_REG: string;
  SA1: string | null;
  SA2: string | null;
  SA3: string | null;
  REVOCATO: boolean;
  SCORTE: boolean | null;
  ConCatalogo: boolean;
}

// ============================================================
// Tipologia
// ============================================================

export interface BdfTipologia {
  COD_TIPO: string;
  DECODIFICA: string;
}

// ============================================================
// Coltura
// ============================================================

export interface BdfColtura {
  ID_PV: number;
  NOME_COLTURA: string;
}

// ============================================================
// Prodotto (dettaglio)
// ============================================================

export interface BdfProdottoDati {
  COD_PRODOTTO: string;
  NOME_COMMERCIALE: string;
  IN_VENDITA: boolean;
  BIO: boolean;
  NUM_REG: string;
  DATA_REG: string | null;
  SA1: string | null;
  SA2: string | null;
  SA3: string | null;
  NOTE_PRODOTTO: string | null;
  NOTE_IMPIEGO: string | null;
  CONFEZIONE: string | null;
  REVOCATO: boolean;
  REVOCA_AUTORIZZAZIONE: string | null;
  SCADENZA_COMMERCIO: string | null;
  SCADENZA_UTILIZZO: string | null;
  COD_AVVERTENZA_CLP: string | null;
  FORMULAZIONE: string | null;
  TITOLARE_REG: string | null;
  TIPOLOGIA: string | null;
  AVVERTENZA_CLP: string | null;
}

// ============================================================
// Dose
// ============================================================

export interface BdfDose {
  ID_DOSE: number;
  COD_PRODOTTO: string;
  CODICE_PV: string | null;
  COD_AVVERSITA: string;
  COD_GR_AVV: string | null;
  DOSE_MIN: number | null;
  DOSE_MAX: number | null;
  COD_UM_DOSE: string | null;
  NUM_MAX_INT: number | null;
  INTERV_TRATT: number | null;
  COD_SITO: string | null;
  COD_METODO_DIST: string | null;
  COD_STADIO_COLT: string | null;
  COD_STADIO_AVV: string | null;
  NOTE: string | null;
  ID_PV: number | null;
  DOSE_MIN_2: number | null;
  DOSE_MAX_2: number | null;
  COD_UM_DOSE_2: string | null;
  ACQUA_HA_MIN: number | null;
  ACQUA_HA_MAX: number | null;
  INTERV_TRATT_MAX: number | null;
  RIF_MAX_TRATT: string | null;
  EPOCA_INTERVENTO: string | null;
  NUM_MAX_INT_AVV: number | null;
  MS: boolean | null;
  QTA_MAX: number | null;
  COD_UM_QTA_MAX: string | null;
  SCADENZA_DOSI: string | null;
  EX_IS: string | null;
  EX_NOME: string | null;
  TIPO_IMP: string | null;
  DOSE_LIMITE: number | null;
  DOSE_LIMITE_2: number | null;
  DATA_INS: string | null;
  DATA_UPD: string | null;
  ID_DETTAGLIO_IMP: string | null;
  RIF_MAX_TRATT2: string | null;
  NUM_MAX_INT2: number | null;
  DECORRENZA: string | null;
  AUT_EMERGENZA: boolean | null;
  JOLLY: string | null;
  NOME_COMMERCIALE: string;
  BIO: boolean;
  NOME_SCI: string | null;
  NOME_ITA: string | null;
  DECO_SITO: string | null;
  DECO_METODO_DIST: string | null;
  DECO_STADIO_AVV: string | null;
  DECO_STADIO_COLT: string | null;
  DECO_UM_DOSE: string | null;
  DECO_UM_DOSE_2: string | null;
  DECO_UM_QTA_MAX: string | null;
  SA1: string | null;
  SA2: string | null;
  SA3: string | null;
  PA1: string | null;
  PA2: string | null;
  PA3: string | null;
  P_SA1: number | null;
  P_SA2: number | null;
  P_SA3: number | null;
  NUM_REG: string;
  DISTRIBUTORI: string;
  Formulaz: string | null;
  DECO_DETTAGLIO_IMP: string | null;
  CARENZA: number | null;
  CARENZA_P: number | null;
}

// ============================================================
// Request Params
// ============================================================

export interface BdfProdListParams {
  ricalfa?: string;
  dettbio?: boolean;
  coltura?: number;
  avversita?: string;
  tipologia?: string;
  codSA?: string;
}

export interface BdfSostListParams {
  ricalfa?: string;
  dettbio?: boolean;
  coltura?: number;
  tipologia?: string;
  codSA?: string;
}

export interface BdfDosiParams {
  codprod: string;
  coltura: number;
  avversita: string;
  codsito?: string;
  codmetododist?: string;
  codstadiocolt?: string;
  iddettimp?: string;
  datatrattamento?: string;
  dataupd1?: string;
  dataupd2?: string;
}

// ============================================================
// Client Config
// ============================================================

export interface BdfClientConfig {
  baseUrl: string;
  username: string;
  password: string;
}
