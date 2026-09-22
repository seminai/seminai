/**
 * ImageLine QuadernoDiCampagna (QDC) REST API Client
 *
 * Composition facade over the per-domain sub-APIs sharing one authenticated
 * HTTP client. OAuth token acquisition lives in `auth.ts`
 * (`getQdcApiFromClientId` returns a ready-to-use instance).
 *
 * Base URL: https://servizi.imagelinenetwork.com/rest/qdc/v2/integrazioni
 * Documentation: https://servizi.imagelinenetwork.com/rest/qdc/v2/integrazioni/help
 */

import { QdcColtureApi } from './colture-api';
import { QdcHttpClient } from './http-client';
import { QdcLicenzaApi } from './licenza-api';
import { QdcMagazzinoAgrofarmaciApi } from './magazzino-agrofarmaci-api';
import { QdcMagazzinoFertilizzantiApi } from './magazzino-fertilizzanti-api';
import { QdcOperazioniCampoApi } from './operazioni-campo-api';
import { QdcOperazioniRegistroApi } from './operazioni-registro-api';
import { QdcProdottiFertilizzantiApi } from './prodotti-fertilizzanti-api';
import { QdcStampeApi } from './stampe-api';

export interface QdcImageLineRestApiOptions {
  readonly fetchImpl?: typeof fetch;
}

export class QdcImageLineRestApi {
  public readonly licenza: QdcLicenzaApi;
  public readonly magazzinoAgrofarmaci: QdcMagazzinoAgrofarmaciApi;
  public readonly magazzinoFertilizzanti: QdcMagazzinoFertilizzantiApi;
  public readonly prodottiFertilizzanti: QdcProdottiFertilizzantiApi;
  public readonly colture: QdcColtureApi;
  public readonly operazioniCampo: QdcOperazioniCampoApi;
  public readonly operazioniRegistro: QdcOperazioniRegistroApi;
  public readonly stampe: QdcStampeApi;
  private readonly http: QdcHttpClient;

  constructor(options: QdcImageLineRestApiOptions = {}) {
    this.http = new QdcHttpClient({ fetchImpl: options.fetchImpl });
    this.licenza = new QdcLicenzaApi(this.http);
    this.magazzinoAgrofarmaci = new QdcMagazzinoAgrofarmaciApi(this.http);
    this.magazzinoFertilizzanti = new QdcMagazzinoFertilizzantiApi(this.http);
    this.prodottiFertilizzanti = new QdcProdottiFertilizzantiApi(this.http);
    this.colture = new QdcColtureApi(this.http);
    this.operazioniCampo = new QdcOperazioniCampoApi(this.http);
    this.operazioniRegistro = new QdcOperazioniRegistroApi(this.http);
    this.stampe = new QdcStampeApi(this.http);
  }

  /** Sets the access token used by every sub-API (sent as the `access_token` query param). */
  public setAccessToken(token: string): void {
    this.http.setAccessToken(token);
  }
}
