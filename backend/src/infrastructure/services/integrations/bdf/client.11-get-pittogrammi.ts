import type { BdfClientContext } from './client.context';

export async function bdfClientGetPittogrammi(this: BdfClientContext, codice: string): Promise<string> {
    return this.requestText('/rest/bdf/agr/pittogrammi', { codice });
  }
