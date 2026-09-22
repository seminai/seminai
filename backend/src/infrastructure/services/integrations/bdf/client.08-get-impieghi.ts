import type { BdfImpiego } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetImpieghi(this: BdfClientContext, codice: string): Promise<BdfImpiego[]> {
    return this.request<BdfImpiego[]>('/rest/bdf/agr/impieghi', {
      tipo: 'P',
      codice,
    });
  }
