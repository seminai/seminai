/**
 * QDC registry-side operation endpoints: other cultural operations, seed
 * treatments, waste disposal and deleted-operations report. Scope: r_operazioni.
 */

import type { QdcHttpClient } from './http-client';
import type { QdcGetAltreOperazioniParams, QdcPeriodoParams } from './operazioni-types';
import type { QdcApiResponse, QdcTableResult } from './types';

export class QdcOperazioniRegistroApi {
  constructor(private readonly http: QdcHttpClient) {}

  /** GET /getaltreoperazioni — other cultural operations in the period. */
  public async getAltreOperazioni(
    params: QdcGetAltreOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getaltreoperazioni', 'GET', {
      id_azienda: params.idAzienda,
      data_periododa: params.dataPeriodoDa,
      data_periodoa: params.dataPeriodoA,
      lista_id_unita: params.listaIdUnita,
      id_coltura: params.idColtura,
      tipo_operazione_id: params.tipoOperazioneId,
    });
  }

  /** GET /getconcesementi — seed treatments (conce) in the period. */
  public async getConceSementi(params: QdcPeriodoParams): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestPeriodo('/getconcesementi', params);
  }

  /** GET /getsmaltimentirifiuti — waste disposal operations in the period. */
  public async getSmaltimentiRifiuti(
    params: QdcPeriodoParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestPeriodo('/getsmaltimentirifiuti', params);
  }

  /** GET /getoperazionieliminate — report of operations deleted in the period. */
  public async getOperazioniEliminate(
    params: QdcPeriodoParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestPeriodo('/getoperazionieliminate', params);
  }

  private async requestPeriodo(
    endpoint: string,
    params: QdcPeriodoParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>(endpoint, 'GET', {
      id_azienda: params.idAzienda,
      data_periododa: params.dataPeriodoDa,
      data_periodoa: params.dataPeriodoA,
    });
  }
}
