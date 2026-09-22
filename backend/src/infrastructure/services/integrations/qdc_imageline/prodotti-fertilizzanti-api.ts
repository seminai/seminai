/**
 * QDC fertilizer product catalog endpoints (search, enable, custom products).
 */

import type { QdcHttpClient } from './http-client';
import type {
  QdcApiResponse,
  QdcNuovoFertilizzanteParams,
  QdcRicercaFertilizzantiParams,
  QdcTableResult,
} from './types';

export class QdcProdottiFertilizzantiApi {
  constructor(private readonly http: QdcHttpClient) {}

  /** GET /getricercafertilizzanti — search fertilizer products. Scope: r_magazzini. */
  public async getRicercaFertilizzanti(
    params: QdcRicercaFertilizzantiParams,
  ): Promise<QdcApiResponse<QdcTableResult>> {
    return this.http.request<QdcTableResult>('/getricercafertilizzanti', 'GET', {
      ricerca: params.ricerca,
      id_azienda: params.idAzienda,
      utilizzati: params.utilizzati,
      abilitati: params.abilitati,
      per_pag: params.perPag ?? 100,
      num_pag: params.numPag ?? 1,
    });
  }

  /**
   * GET /prodottoabilita — enable a product and obtain its unique `id_abilitato`.
   * Scope: w_magazzini.
   */
  public async prodottoAbilita(prodKey: string): Promise<QdcApiResponse<{ id_abilitato: number }>> {
    return this.http.request<{ id_abilitato: number }>('/prodottoabilita', 'GET', {
      prod_key: prodKey,
    });
  }

  /**
   * GET /prodottoassegnacodice — attach a custom external code to an enabled
   * product, to bridge QDC with an external ERP product catalog. Scope: w_magazzini.
   */
  public async prodottoAssegnaCodice(params: {
    idAbilitato: number;
    codiceEsterno: string;
  }): Promise<QdcApiResponse> {
    return this.http.request('/prodottoassegnacodice', 'GET', {
      id_abilitato: params.idAbilitato,
      codice_esterno: params.codiceEsterno,
    });
  }

  /**
   * POST /setnuovofertilizzante — create a custom fertilizer product.
   * Scope: w_magazzini. Limit: max 10 per day.
   */
  public async setNuovoFertilizzante(
    params: QdcNuovoFertilizzanteParams,
  ): Promise<QdcApiResponse<{ id_abilitato: number }>> {
    return this.http.request<{ id_abilitato: number }>('/setnuovofertilizzante', 'POST', {
      nome: params.nome,
      bio: params.bio,
      tipo: params.tipo,
    });
  }
}
