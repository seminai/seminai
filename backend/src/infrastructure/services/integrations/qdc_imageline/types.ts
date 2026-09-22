/**
 * Types for ImageLine QuadernoDiCampagna (QDC) API integration
 */

// OAuth2 Scopes
export type QdcScope =
  | 'r_anagrafica'
  | 'r_colture'
  | 'r_operazioni'
  | 'r_magazzini'
  | 'w_magazzini'
  | 'r_stampe'
  | 'r_conferimenti';

/** Every scope exposed by the QDC "integrazioni" API. */
export const QDC_ALL_SCOPES: readonly QdcScope[] = [
  'r_anagrafica',
  'r_colture',
  'r_operazioni',
  'r_magazzini',
  'w_magazzini',
  'r_stampe',
  'r_conferimenti',
] as const;

// HTTP param primitives (number arrays are serialized as comma-separated lists)
export type QdcParamValue = string | number | boolean | readonly number[] | undefined;
export type QdcParams = Record<string, QdcParamValue>;

// OAuth2 Types
export interface QdcOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface QdcAuthResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
}

// API Response Types
export interface QdcApiResponse<T = unknown> {
  message: string;
  result?: T;
  error?: string;
  error_description?: string;
  error_reason?: string;
}

/** Cell values can nest JSON (e.g. getunita FASI carries an array of objects). */
export type QdcCellValue =
  | string
  | number
  | boolean
  | null
  | readonly QdcCellValue[]
  | { readonly [key: string]: QdcCellValue };

/**
 * Recordset shape. The key casing VARIES by endpoint (verified live):
 * license/warehouse/print endpoints use UPPERCASE `COLUMNS`/`DATA`, while the
 * operation endpoints (gettrattamenti, getunita, ...) use lowercase
 * `columns`/`data` (+`rows`). Use `parseTableToRecords` to normalize.
 */
export interface QdcTableResult {
  COLUMNS?: readonly string[];
  DATA?: readonly (readonly QdcCellValue[])[];
  columns?: readonly string[];
  data?: readonly (readonly QdcCellValue[])[];
  rows?: number;
}

// Licenza Types
export interface QdcLicenzaInfo {
  id: number;
  nome: string;
  scadenza: string;
  stato: string;
}

export interface QdcAziendaRow {
  id: number;
  azienda: string;
  piva: string;
  cf: string;
  validaDa: string;
  validaA: string;
  disabilitata: boolean;
}

export interface QdcAzienda {
  id: number;
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  indirizzo?: string;
  cap?: string;
  comune?: string;
  provincia?: string;
  regione?: string;
  telefono?: string;
  email?: string;
  pec?: string;
}

export interface QdcTecnico {
  id: number;
  nome: string;
  cognome: string;
  email?: string;
  codiceFiscale?: string;
}

// Giacenze Types
export interface QdcGiacenzaAgrofarmaco {
  prodotto: string;
  numreg: number;
  settore: string;
  qta: number;
  udm: string;
}

export interface QdcGiacenzaFertilizzante {
  prodotto: string;
  idAbilitato: number;
  settore: string;
  qta: number;
  udm: string;
}

// Carico/Reso Types
export type QdcUnitaMisuraAgrofarmaco = 'KG' | 'L' | 'N';
export type QdcUnitaMisuraFertilizzante = 'KG' | 'L' | 'MC' | 'N';
export type QdcTipoScarico = 'reso' | 'contoterzi' | 'altro';

export interface QdcCaricoAgrofarmaco {
  id: number;
  data: string;
  numreg: number;
  prodotto: string;
  qta: number;
  udm: string;
  numeroFattura?: string;
  dataFattura?: string;
  note?: string;
  fornitore?: string;
}

export interface QdcResoAgrofarmaco {
  id: number;
  data: string;
  numreg: number;
  prodotto: string;
  qta: number;
  udm: string;
  tipoScarico?: string;
  note?: string;
}

export interface QdcCaricoFertilizzante {
  id: number;
  data: string;
  idAbilitato: number;
  prodotto: string;
  qta: number;
  udm: string;
  numeroFattura?: string;
  note?: string;
}

export interface QdcResoFertilizzante {
  id: number;
  data: string;
  idAbilitato: number;
  prodotto: string;
  qta: number;
  udm: string;
  tipoScarico?: string;
  note?: string;
}

// Fertilizzanti Types
export interface QdcFertilizzanteRicerca {
  prodKey: string;
  nome: string;
  produttore?: string;
  bio: boolean;
  tipo: string;
  idAbilitato?: number;
}

export interface QdcNuovoFertilizzanteParams {
  nome: string;
  bio: boolean;
  tipo: string;
}

export type QdcTipoFertilizzante =
  | 'Concime chimico'
  | 'Concime organico'
  | 'Concime organo-minerale'
  | 'Ammendante'
  | 'Correttivo'
  | 'Substrato di coltivazione'
  | 'Biostimolante'
  | 'Prodotto ad azione specifica'
  | 'Concime CE'
  | 'Concime nazionale'
  | 'Fertilizzante biologico'
  | 'Altro fertilizzante'
  | 'Concime a lenta cessione'
  | 'Concime a rilascio controllato';

// Error Types
export type QdcErrorCode =
  | 'temporarily_unavailable'
  | 'invalid_request'
  | 'access_denied'
  | 'unauthorized_client'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'server_error';

export interface QdcError {
  error: QdcErrorCode;
  error_description: string;
  error_reason?: string;
}

// Request Params Types
export interface QdcRicercaFertilizzantiParams {
  ricerca: string;
  idAzienda?: number;
  utilizzati?: boolean;
  abilitati?: boolean;
  perPag?: number;
  numPag?: number;
}

export interface QdcSetCaricoAgrofarmacoParams {
  idAzienda: number;
  dataCarico: string;
  numreg: number;
  qta: number;
  udm: QdcUnitaMisuraAgrofarmaco;
  numeroFattura?: string;
  dataFattura?: string;
  note?: string;
  fornitoreNome?: string;
  fornitoreQualifica?: string;
}

export interface QdcSetResoAgrofarmacoParams {
  idAzienda: number;
  dataReso: string;
  numreg: number;
  qta: number;
  udm: QdcUnitaMisuraAgrofarmaco;
  tipoScarico?: QdcTipoScarico;
  note?: string;
}

export interface QdcSetCaricoFertilizzanteParams {
  idAzienda: number;
  dataCarico: string;
  idAbilitato: number;
  qta: number;
  udm: QdcUnitaMisuraFertilizzante;
  numeroFattura?: string;
  note?: string;
}

export interface QdcSetResoFertilizzanteParams {
  idAzienda: number;
  dataReso: string;
  idAbilitato: number;
  qta: number;
  udm: QdcUnitaMisuraFertilizzante;
  tipoScarico?: QdcTipoScarico;
  note?: string;
}
