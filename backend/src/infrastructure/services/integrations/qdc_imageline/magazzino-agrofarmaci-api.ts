/**
 * QDC pesticide (agrofarmaci) warehouse endpoints.
 * Read scope: r_magazzini — write scope: w_magazzini.
 */

import type { QdcHttpClient } from './http-client';
import type {
  QdcApiResponse,
  QdcSetCaricoAgrofarmacoParams,
  QdcSetResoAgrofarmacoParams,
  QdcTableResult,
} from './types';

export class QdcMagazzinoAgrofarmaciApi {
  constructor(private readonly http: QdcHttpClient) {}

  /** GET /getgiacenzeagrofarmaci — stock levels at a date (numreg 0 = all products). */
  public async getGiacenzeAgrofarmaci(params: {
    idAzienda: number;
    data: string;
    numreg?: number;
  }): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getgiacenzeagrofarmaci', 'GET', {
      id_azienda: params.idAzienda,
      data: params.data,
      numreg: params.numreg ?? 0,
    });
  }

  /** POST /setcaricoagrofarmaco — register a stock load (purchase). */
  public async setCaricoAgrofarmaco(
    params: QdcSetCaricoAgrofarmacoParams,
  ): Promise<QdcApiResponse> {
    return this.http.request('/setcaricoagrofarmaco', 'POST', {
      id_azienda: params.idAzienda,
      data_carico: params.dataCarico,
      numreg: params.numreg,
      qta: params.qta,
      udm: params.udm,
      numero_fattura: params.numeroFattura,
      data_fattura: params.dataFattura,
      note: params.note,
      fornitore_nome: params.fornitoreNome,
      fornitore_qualifica: params.fornitoreQualifica,
    });
  }

  /** GET /getcarichiagrofarmaci — stock load history in a period. */
  public async getCarichiAgrofarmaci(params: {
    idAzienda: number;
    dataPeriodoDa?: string;
    dataPeriodoA?: string;
    numreg?: number;
  }): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getcarichiagrofarmaci', 'GET', {
      id_azienda: params.idAzienda,
      data_periododa: params.dataPeriodoDa,
      data_periodoa: params.dataPeriodoA,
      numreg: params.numreg,
    });
  }

  /** GET /delcaricoagrofarmaco — delete a stock load record. */
  public async delCaricoAgrofarmaco(params: {
    idAzienda: number;
    idCarico: number;
  }): Promise<QdcApiResponse> {
    return this.http.request('/delcaricoagrofarmaco', 'GET', {
      id_azienda: params.idAzienda,
      id_carico: params.idCarico,
    });
  }

  /** POST /setresoagrofarmaco — register a return/discharge. */
  public async setResoAgrofarmaco(params: QdcSetResoAgrofarmacoParams): Promise<QdcApiResponse> {
    return this.http.request('/setresoagrofarmaco', 'POST', {
      id_azienda: params.idAzienda,
      data_reso: params.dataReso,
      numreg: params.numreg,
      qta: params.qta,
      udm: params.udm,
      tipo_scarico: params.tipoScarico,
      note: params.note,
    });
  }

  /** GET /getresiagrofarmaci — return/discharge history in a period. */
  public async getResiAgrofarmaci(params: {
    idAzienda: number;
    dataPeriodoDa?: string;
    dataPeriodoA?: string;
    numreg?: number;
  }): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getresiagrofarmaci', 'GET', {
      id_azienda: params.idAzienda,
      data_periododa: params.dataPeriodoDa,
      data_periodoa: params.dataPeriodoA,
      numreg: params.numreg,
    });
  }

  /** GET /delresoagrofarmaco — delete a return record. */
  public async delResoAgrofarmaco(params: {
    idAzienda: number;
    idReso: number;
  }): Promise<QdcApiResponse> {
    return this.http.request('/delresoagrofarmaco', 'GET', {
      id_azienda: params.idAzienda,
      id_reso: params.idReso,
    });
  }
}
