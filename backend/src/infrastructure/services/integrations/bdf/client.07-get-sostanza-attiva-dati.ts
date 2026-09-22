import type { BdfSostanzaAttivaDati } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetSostanzaAttivaDati(this: BdfClientContext, id: string): Promise<BdfSostanzaAttivaDati[]> {
    return this.request<BdfSostanzaAttivaDati[]>(`/rest/bdf/agr/sostdati/${id}`);
  }
