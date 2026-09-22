import type { BdfDistributore } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetDistributori(this: BdfClientContext, codice: string): Promise<BdfDistributore[]> {
    return this.request<BdfDistributore[]>('/rest/bdf/agr/azidistr', { codice });
  }
