/**
 * QDC print/report endpoints. Scope: r_stampe.
 */

import type { QdcHttpClient } from './http-client';
import type { QdcGetRegistroTrattamentiParams } from './operazioni-types';
import type { QdcApiResponse, QdcTableResult } from './types';

export class QdcStampeApi {
  constructor(private readonly http: QdcHttpClient) {}

  /**
   * GET /getregistrotrattamenti — info on the latest Registro dei Trattamenti
   * PDFs (D.Lgs. 150/2012) produced for the company.
   */
  public async getRegistroTrattamenti(
    params: QdcGetRegistroTrattamentiParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getregistrotrattamenti', 'GET', {
      id_azienda: params.idAzienda,
      elementi: params.elementi,
    });
  }
}
