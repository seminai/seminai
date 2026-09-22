import type { BdfComposizione } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetComposizione(this: BdfClientContext, codice: string): Promise<BdfComposizione[]> {
    return this.request<BdfComposizione[]>('/rest/bdf/agr/composiz', { codice });
  }
