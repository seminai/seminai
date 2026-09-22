import type { BdfAvversita } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetAvversita(this: BdfClientContext, coltura: string | number): Promise<BdfAvversita[]> {
    return this.request<BdfAvversita[]>('/rest/bdf/agr/avversita', {
      coltura: String(coltura),
    });
  }
