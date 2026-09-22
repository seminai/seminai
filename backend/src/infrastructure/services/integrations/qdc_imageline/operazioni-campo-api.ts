/**
 * QDC field-operation reading endpoints sharing the same filter shape
 * (company + period + production units + crop). Scope: r_operazioni.
 */

import type { QdcHttpClient } from './http-client';
import type { QdcGetOperazioniParams } from './operazioni-types';
import type { QdcApiResponse, QdcTableResult } from './types';

export class QdcOperazioniCampoApi {
  constructor(private readonly http: QdcHttpClient) {}

  /** GET /gettrattamenti — phytosanitary treatments in the period. */
  public async getTrattamenti(
    params: QdcGetOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/gettrattamenti', params);
  }

  /** GET /getfertilizzazioni — fertilization operations in the period. */
  public async getFertilizzazioni(
    params: QdcGetOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/getfertilizzazioni', params);
  }

  /** GET /getlanciausiliari — beneficial-organism release operations in the period. */
  public async getLanciAusiliari(
    params: QdcGetOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/getlanciausiliari', params);
  }

  /** GET /getirrigazioni — irrigation operations in the period. */
  public async getIrrigazioni(
    params: QdcGetOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/getirrigazioni', params);
  }

  /** GET /getraccolte — harvests in the period. */
  public async getRaccolte(
    params: QdcGetOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/getraccolte', params);
  }

  /** GET /getsemine — sowings in the period. */
  public async getSemine(params: QdcGetOperazioniParams): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/getsemine', params);
  }

  /** GET /gettrapianti — transplants in the period. */
  public async getTrapianti(
    params: QdcGetOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/gettrapianti', params);
  }

  /** GET /getsovesci — cover crops / intercropping in the period. */
  public async getSovesci(params: QdcGetOperazioniParams): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/getsovesci', params);
  }

  /** GET /getispezionicampo — field inspections in the period. */
  public async getIspezioniCampo(
    params: QdcGetOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.requestOperazioniPeriodo('/getispezionicampo', params);
  }

  private async requestOperazioniPeriodo(
    endpoint: string,
    params: QdcGetOperazioniParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>(endpoint, 'GET', {
      id_azienda: params.idAzienda,
      data_periododa: params.dataPeriodoDa,
      data_periodoa: params.dataPeriodoA,
      lista_id_unita: params.listaIdUnita,
      id_coltura: params.idColtura,
    });
  }
}
