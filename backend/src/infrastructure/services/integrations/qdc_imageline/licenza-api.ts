/**
 * QDC license, company registry and technician association endpoints.
 */

import type { QdcHttpClient } from './http-client';
import type { QdcScadenzeResult } from './operazioni-types';
import type { QdcApiResponse, QdcTableResult } from './types';

export class QdcLicenzaApi {
  constructor(private readonly http: QdcHttpClient) {}

  /** GET /getlicenzainfo — detailed license information. */
  public async getLicenzaInfo(): Promise<QdcApiResponse> {
    return this.http.request('/getlicenzainfo');
  }

  /** GET /getlicenzaaziende — companies linked to the license. */
  public async getLicenzaAziende(
    params: { mostraDisabilitate?: boolean } = {},
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getlicenzaaziende', 'GET', {
      mostra_disabilitate: params.mostraDisabilitate ?? false,
    });
  }

  /** GET /getazienda — company registry details. Scope: r_anagrafica. */
  public async getAzienda(idAzienda: number): Promise<QdcApiResponse> {
    return this.http.request('/getazienda', 'GET', { id_azienda: idAzienda });
  }

  /** GET /getlicenzatecnici — technicians enabled for the license. */
  public async getLicenzaTecnici(): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getlicenzatecnici');
  }

  /** GET /getlicenzaassociazioni — technician/company associations. */
  public async getLicenzaAssociazioni(): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getlicenzaassociazioni');
  }

  /** POST /setlicenzaassociazione — create a technician/company association. */
  public async setLicenzaAssociazione(params: {
    idAzienda: number;
    idTecnico: number;
  }): Promise<QdcApiResponse> {
    return this.http.request('/setlicenzaassociazione', 'POST', {
      id_azienda: params.idAzienda,
      id_tecnico: params.idTecnico,
    });
  }

  /** GET /dellicenzaassociazione — delete a technician/company association. */
  public async delLicenzaAssociazione(params: {
    idAzienda: number;
    idTecnico: number;
  }): Promise<QdcApiResponse> {
    return this.http.request('/dellicenzaassociazione', 'GET', {
      id_azienda: params.idAzienda,
      id_tecnico: params.idTecnico,
    });
  }

  /**
   * GET /getscadenze — report on operator certificates (patentini) and
   * sprayer functional inspections (tarature). Scope: r_anagrafica.
   * Note: this endpoint returns the two lists directly, without the standard
   * `{message, result}` envelope.
   */
  public async getScadenze(idAzienda: number): Promise<QdcScadenzeResult> {
    return this.http.requestRaw<QdcScadenzeResult>('/getscadenze', 'GET', {
      id_azienda: idAzienda,
    });
  }
}
