/**
 * Types and operation registry for the QDC → Seminai mirror sync.
 *
 * SAFETY: the sync is strictly READ-ONLY toward QDC (get* endpoints only).
 * `getConferimenti` is intentionally absent from the registry: the license
 * does not grant the r_conferimenti scope (silently dropped by the server).
 */

import type { QdcImageLineRestApi } from '../rest_api';
import type { QdcGetOperazioniParams } from '../operazioni-types';
import type { QdcApiResponse, QdcTableResult } from '../types';

export interface QdcSyncCounters {
  aziendeTotal: number;
  aziendeFailed: number;
  unitaUpserted: number;
  operazioniUpserted: number;
  operazioniDeleted: number;
  giacenzeRows: number;
  scadenzeRows: number;
  skippedNoId: number;
}

export interface QdcAziendaError {
  readonly qdcId: number;
  readonly nome: string;
  readonly step: string;
  readonly message: string;
}

export type QdcSyncStatus = 'success' | 'partial' | 'error';

export interface QdcSyncOutcome {
  readonly status: QdcSyncStatus;
  readonly counters: QdcSyncCounters;
  readonly aziendaErrors: readonly QdcAziendaError[];
}

export interface QdcSyncOptions {
  /** Limits the number of aziende deep-synced (tests only; anagrafica still syncs all). */
  readonly maxAziende?: number;
}

export interface QdcOperationFetcher {
  readonly tipo: string;
  readonly fetch: (
    api: QdcImageLineRestApi,
    params: QdcGetOperazioniParams,
  ) => Promise<QdcApiResponse<QdcTableResult>>;
}

export const QDC_OPERATION_TYPES: readonly QdcOperationFetcher[] = [
  { tipo: 'trattamenti', fetch: (api, p) => api.operazioniCampo.getTrattamenti(p) },
  { tipo: 'fertilizzazioni', fetch: (api, p) => api.operazioniCampo.getFertilizzazioni(p) },
  { tipo: 'irrigazioni', fetch: (api, p) => api.operazioniCampo.getIrrigazioni(p) },
  { tipo: 'raccolte', fetch: (api, p) => api.operazioniCampo.getRaccolte(p) },
  { tipo: 'semine', fetch: (api, p) => api.operazioniCampo.getSemine(p) },
  { tipo: 'trapianti', fetch: (api, p) => api.operazioniCampo.getTrapianti(p) },
  { tipo: 'sovesci', fetch: (api, p) => api.operazioniCampo.getSovesci(p) },
  { tipo: 'ispezioni_campo', fetch: (api, p) => api.operazioniCampo.getIspezioniCampo(p) },
  { tipo: 'lanci_ausiliari', fetch: (api, p) => api.operazioniCampo.getLanciAusiliari(p) },
  { tipo: 'altre_operazioni', fetch: (api, p) => api.operazioniRegistro.getAltreOperazioni(p) },
  { tipo: 'conce_sementi', fetch: (api, p) => api.operazioniRegistro.getConceSementi(p) },
  {
    tipo: 'smaltimenti_rifiuti',
    fetch: (api, p) => api.operazioniRegistro.getSmaltimentiRifiuti(p),
  },
] as const;

export function emptyCounters(): QdcSyncCounters {
  return {
    aziendeTotal: 0,
    aziendeFailed: 0,
    unitaUpserted: 0,
    operazioniUpserted: 0,
    operazioniDeleted: 0,
    giacenzeRows: 0,
    scadenzeRows: 0,
    skippedNoId: 0,
  };
}
