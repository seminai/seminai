import type { BdfProdottoDati } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetProdottoDati(this: BdfClientContext, id: string): Promise<BdfProdottoDati[]> {
    return this.request<BdfProdottoDati[]>(`/rest/bdf/agr/proddati/${id}`);
  }
