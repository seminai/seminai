/**
 * Request param types for the QDC field-operation, crop and print endpoints.
 *
 * Dates accept both 'gg/mm/aaaa' and 'aaaa-mm-gg'. Period endpoints default
 * server-side to dataPeriodoDa = dataPeriodoA − 1 year and dataPeriodoA = today,
 * with a maximum window of 365 days.
 */

/** Common period filter shared by every "get<operazione>" endpoint. */
export interface QdcPeriodoParams {
  readonly idAzienda: number;
  readonly dataPeriodoDa?: string;
  readonly dataPeriodoA?: string;
}

/** Period filter plus production-unit and crop filters. */
export interface QdcGetOperazioniParams extends QdcPeriodoParams {
  /** Serialized as comma-separated `lista_id_unita`. */
  readonly listaIdUnita?: readonly number[];
  readonly idColtura?: number;
}

/** GET /getaltreoperazioni also filters by operation type. */
export interface QdcGetAltreOperazioniParams extends QdcGetOperazioniParams {
  readonly tipoOperazioneId?: number;
}

/**
 * GET /getunita — production units of a company.
 * The server requires a valid `anno` OR a valid `listaIdUnita` (verified live:
 * omitting both returns HTTP 400).
 */
export interface QdcGetUnitaParams {
  readonly idAzienda: number;
  /** One year (or one annata agraria) per request. */
  readonly anno?: number;
  readonly listaIdUnita?: readonly number[];
  readonly idColtura?: number;
  /** true = only units awaiting confirmation, false = only confirmed ones. */
  readonly daConfermare?: boolean;
  readonly codice?: string;
  readonly codiceEsterno?: string;
  /** Reference date for the reported surface. */
  readonly dataRifSuperficie?: string;
  /** Day/month of this date mark the start of the agricultural year for the `anno` filter. */
  readonly inizioAnnataAgraria?: string;
}

/** GET /getregistrotrattamenti — info on the last N Registro dei Trattamenti PDFs. */
export interface QdcGetRegistroTrattamentiParams {
  readonly idAzienda: number;
  /** Only the most recent N entries. */
  readonly elementi?: number;
}

/**
 * GET /getscadenze response — this endpoint skips the `{message, result}`
 * envelope and returns the two lists directly (verified live).
 */
export interface QdcScadenzeResult {
  /** Operator certificates (patentini / certificati di abilitazione). */
  readonly patentini: readonly Record<string, unknown>[];
  /** Sprayer functional inspections (tarature / controlli funzionali). */
  readonly tarature: readonly Record<string, unknown>[];
}
