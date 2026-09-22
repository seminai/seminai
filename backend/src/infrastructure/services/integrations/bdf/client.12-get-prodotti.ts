import type { BdfProdListParams, BdfProdotto } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetProdotti(this: BdfClientContext, params: BdfProdListParams): Promise<BdfProdotto[]> {
    return this.request<BdfProdotto[]>('/rest/bdf/agr/prodlist', {
      ricalfa: params.ricalfa,
      dettbio: params.dettbio,
      coltura: params.coltura,
      avversita: params.avversita,
      tipologia: params.tipologia,
      codSA: params.codSA,
    });
  }
