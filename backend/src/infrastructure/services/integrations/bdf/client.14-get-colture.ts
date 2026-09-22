import type { BdfColtura } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetColture(this: BdfClientContext): Promise<BdfColtura[]> {
    return this.request<BdfColtura[]>('/rest/bdf/agr/colture');
  }
