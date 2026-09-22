import type { BdfDose, BdfDosiParams } from './types';
import type { BdfClientContext } from './client.context';

export async function bdfClientGetDosi(this: BdfClientContext, params: BdfDosiParams): Promise<BdfDose[]> {
    const raw = await this.request<unknown>('/rest/bdf/agr/dosi', {
      codprod: params.codprod,
      coltura: params.coltura,
      avversita: params.avversita,
      codsito: params.codsito,
      codmetododist: params.codmetododist,
      codstadiocolt: params.codstadiocolt,
      iddettimp: params.iddettimp,
      datatrattamento: params.datatrattamento,
      dataupd1: params.dataupd1,
      dataupd2: params.dataupd2,
    });
    if (Array.isArray(raw)) return raw as BdfDose[];
    if (raw && typeof raw === 'object') return [raw as BdfDose];
    return [];
  }
