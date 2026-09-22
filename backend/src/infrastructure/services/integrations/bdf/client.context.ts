import type { BdfAvversita, BdfColtura, BdfComposizione, BdfDistributore, BdfDose, BdfDosiParams, BdfImpiego, BdfProdListParams, BdfProdotto, BdfProdottoDati, BdfSostanzaAttiva, BdfSostanzaAttivaDati, BdfSostListParams, BdfTipologia } from './types';

export interface BdfClientContext {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  accessToken: string | null;
  authenticate(): Promise<string>;
  curlGet(url: string): Promise<string>;
  request<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
  requestText(endpoint: string, params?: Record<string, string | number | boolean | undefined>): Promise<string>;
  getAvversita(coltura: string | number): Promise<BdfAvversita[]>;
  getDistributori(codice: string): Promise<BdfDistributore[]>;
  getSostanzaAttivaDati(id: string): Promise<BdfSostanzaAttivaDati[]>;
  getImpieghi(codice: string): Promise<BdfImpiego[]>;
  getSostanzeAttive(params: BdfSostListParams): Promise<BdfSostanzaAttiva[]>;
  getComposizione(codice: string): Promise<BdfComposizione[]>;
  getPittogrammi(codice: string): Promise<string>;
  getProdotti(params: BdfProdListParams): Promise<BdfProdotto[]>;
  getTipologie(): Promise<BdfTipologia[]>;
  getColture(): Promise<BdfColtura[]>;
  getProdottoDati(id: string): Promise<BdfProdottoDati[]>;
  getDosi(params: BdfDosiParams): Promise<BdfDose[]>;
}
