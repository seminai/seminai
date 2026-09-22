import type { BdfSostanzaAttiva, BdfSostListParams } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetSostanzeAttive(this: BdfClientContext, params: BdfSostListParams): Promise<BdfSostanzaAttiva[]> {
    return this.request<BdfSostanzaAttiva[]>('/rest/bdf/agr/sostlist', {
      ricalfa: params.ricalfa,
      dettbio: params.dettbio,
      coltura: params.coltura,
      tipologia: params.tipologia,
      codSA: params.codSA,
    });
  }
