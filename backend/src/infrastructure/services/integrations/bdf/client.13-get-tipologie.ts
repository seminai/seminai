import type { BdfTipologia } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetTipologie(this: BdfClientContext): Promise<BdfTipologia[]> {
    return this.request<BdfTipologia[]>('/rest/bdf/agr/tipologie');
  }
