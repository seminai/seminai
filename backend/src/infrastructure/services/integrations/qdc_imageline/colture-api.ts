/**
 * QDC production units and outgoing production batches endpoints.
 */

import type { QdcHttpClient } from './http-client';
import type { QdcGetUnitaParams, QdcPeriodoParams } from './operazioni-types';
import type { QdcApiResponse, QdcTableResult } from './types';

export class QdcColtureApi {
  constructor(private readonly http: QdcHttpClient) {}

  /** GET /getunita — production units of a company for a year. Scope: r_colture. */
  public async getUnita(params: QdcGetUnitaParams): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getunita', 'GET', {
      id_azienda: params.idAzienda,
      anno: params.anno,
      lista_id_unita: params.listaIdUnita,
      id_coltura: params.idColtura,
      daconfermare: params.daConfermare,
      codice: params.codice,
      codiceesterno: params.codiceEsterno,
      datarif_superficie: params.dataRifSuperficie,
      inizioannataagraria: params.inizioAnnataAgraria,
    });
  }

  /**
   * GET /getconferimenti — outgoing production batches in a period.
   * Scope: r_conferimenti.
   */
  public async getConferimenti(params: QdcPeriodoParams): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getconferimenti', 'GET', {
      id_azienda: params.idAzienda,
      data_periododa: params.dataPeriodoDa,
      data_periodoa: params.dataPeriodoA,
    });
  }
}
