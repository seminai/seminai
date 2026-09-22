/**
 * QDC fertilizer warehouse endpoints.
 * Read scope: r_magazzini — write scope: w_magazzini.
 */

import type { QdcHttpClient } from './http-client';
import type {
  QdcApiResponse,
  QdcSetCaricoFertilizzanteParams,
  QdcSetResoFertilizzanteParams,
  QdcTableResult,
} from './types';

export class QdcMagazzinoFertilizzantiApi {
  constructor(private readonly http: QdcHttpClient) {}

  /** GET /getgiacenzefertilizzanti — stock levels at a date (idAbilitato 0 = all products). */
  public async getGiacenzeFertilizzanti(params: {
    idAzienda: number;
    data: string;
    idAbilitato?: number;
  }): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getgiacenzefertilizzanti', 'GET', {
      id_azienda: params.idAzienda,
      data: params.data,
      id_abilitato: params.idAbilitato ?? 0,
    });
  }

  /** POST /setcaricofertilizzante — register a stock load (purchase). */
  public async setCaricoFertilizzante(
    params: QdcSetCaricoFertilizzanteParams,
  ): Promise<QdcApiResponse> {
    return this.http.request('/setcaricofertilizzante', 'POST', {
      id_azienda: params.idAzienda,
      data_carico: params.dataCarico,
      id_abilitato: params.idAbilitato,
      qta: params.qta,
      udm: params.udm,
      numero_fattura: params.numeroFattura,
      note: params.note,
    });
  }

  /** GET /getcarichifertilizzanti — stock load history in a period. */
  public async getCarichiFertilizzanti(params: {
    idAzienda: number;
    dataPeriodoDa?: string;
    dataPeriodoA?: string;
    idAbilitato?: number;
  }): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getcarichifertilizzanti', 'GET', {
      id_azienda: params.idAzienda,
      data_periododa: params.dataPeriodoDa,
      data_periodoa: params.dataPeriodoA,
      id_abilitato: params.idAbilitato,
    });
  }

  /** GET /delcaricofertilizzante — delete a stock load record. */
  public async delCaricoFertilizzante(params: {
    idAzienda: number;
    idCarico: number;
  }): Promise<QdcApiResponse> {
    return this.http.request('/delcaricofertilizzante', 'GET', {
      id_azienda: params.idAzienda,
      id_carico: params.idCarico,
    });
  }

  /** POST /setresofertilizzante — register a return/discharge. */
  public async setResoFertilizzante(
    params: QdcSetResoFertilizzanteParams,
  ): Promise<QdcApiResponse> {
    return this.http.request('/setresofertilizzante', 'POST', {
      id_azienda: params.idAzienda,
      data_reso: params.dataReso,
      id_abilitato: params.idAbilitato,
      qta: params.qta,
      udm: params.udm,
      tipo_scarico: params.tipoScarico,
      note: params.note,
    });
  }

  /** GET /getresifertilizzanti — return/discharge history in a period. */
  public async getResiFertilizzanti(params: {
    idAzienda: number;
    dataPeriodoDa?: string;
    dataPeriodoA?: string;
    idAbilitato?: number;
  }): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getresifertilizzanti', 'GET', {
      id_azienda: params.idAzienda,
      data_periododa: params.dataPeriodoDa,
      data_periodoa: params.dataPeriodoA,
      id_abilitato: params.idAbilitato,
    });
  }

  /** GET /delresofertilizzante — delete a return record. */
  public async delResoFertilizzante(params: {
    idAzienda: number;
    idReso: number;
  }): Promise<QdcApiResponse> {
    return this.http.request('/delresofertilizzante', 'GET', {
      id_azienda: params.idAzienda,
      id_reso: params.idReso,
    });
  }
}
