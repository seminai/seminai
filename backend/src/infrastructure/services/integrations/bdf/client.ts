import type { BdfAvversita, BdfClientConfig, BdfColtura, BdfComposizione, BdfDistributore, BdfDose, BdfDosiParams, BdfImpiego, BdfProdListParams, BdfProdotto, BdfProdottoDati, BdfSostanzaAttiva, BdfSostanzaAttivaDati, BdfSostListParams, BdfTipologia } from './types';
import type { BdfClientContext } from './client.context';
import { bdfClientAuthenticate } from './client.01-authenticate';
import { bdfClientCurlGet } from './client.02-curl-get';
import { bdfClientRequest } from './client.03-request';
import { bdfClientRequestText } from './client.04-request-text';
import { bdfClientGetAvversita } from './client.05-get-avversita';
import { bdfClientGetDistributori } from './client.06-get-distributori';
import { bdfClientGetSostanzaAttivaDati } from './client.07-get-sostanza-attiva-dati';
import { bdfClientGetImpieghi } from './client.08-get-impieghi';
import { bdfClientGetSostanzeAttive } from './client.09-get-sostanze-attive';
import { bdfClientGetComposizione } from './client.10-get-composizione';
import { bdfClientGetPittogrammi } from './client.11-get-pittogrammi';
import { bdfClientGetProdotti } from './client.12-get-prodotti';
import { bdfClientGetTipologie } from './client.13-get-tipologie';
import { bdfClientGetColture } from './client.14-get-colture';
import { bdfClientGetProdottoDati } from './client.15-get-prodotto-dati';
import { bdfClientGetDosi } from './client.16-get-dosi';


export class BdfClient {

  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  accessToken: string | null = null;

  constructor(config: BdfClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.username = config.username;
    this.password = config.password;
  }

  // ============================================================
  // Authentication
  // ============================================================

  /**
   * Authenticate with BDF WS using Basic Auth.
   * Stores the JWT Bearer token for subsequent requests.
   */
  public async authenticate(): Promise<string> {
    return bdfClientAuthenticate.call(this as unknown as BdfClientContext);
  }

  // ============================================================
  // HTTP Request Helper
  // ============================================================

  async curlGet(url: string): Promise<string> {
    return bdfClientCurlGet.call(this as unknown as BdfClientContext, url);
  }

  async request<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    return bdfClientRequest.call(this as unknown as BdfClientContext, endpoint, params);
  }

  async requestText(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<string> {
    return bdfClientRequestText.call(this as unknown as BdfClientContext, endpoint, params);
  }

  // ============================================================
  // AGR - Avversità per codice coltura
  // ============================================================

  /**
   * Lista avversità per codice coltura
   * GET /rest/bdf/agr/avversita?coltura={coltura}
   */
  public async getAvversita(coltura: string | number): Promise<BdfAvversita[]> {
    return bdfClientGetAvversita.call(this as unknown as BdfClientContext, coltura);
  }

  // ============================================================
  // AGR - Distributori per codice formulato commerciale
  // ============================================================

  /**
   * Lista distributori per codice formulato commerciale
   * GET /rest/bdf/agr/azidistr?codice={codice}
   */
  public async getDistributori(codice: string): Promise<BdfDistributore[]> {
    return bdfClientGetDistributori.call(this as unknown as BdfClientContext, codice);
  }

  // ============================================================
  // AGR - Dettaglio singola Sostanza attiva per codice
  // ============================================================

  /**
   * Dettaglio singola sostanza attiva
   * GET /rest/bdf/agr/sostdati/{id}
   */
  public async getSostanzaAttivaDati(id: string): Promise<BdfSostanzaAttivaDati[]> {
    return bdfClientGetSostanzaAttivaDati.call(this as unknown as BdfClientContext, id);
  }

  // ============================================================
  // AGR - Colture autorizzate per codice formulato commerciale
  // ============================================================

  /**
   * Lista colture autorizzate per il codice formulato commerciale
   * GET /rest/bdf/agr/impieghi?tipo=P&codice={codice}
   */
  public async getImpieghi(codice: string): Promise<BdfImpiego[]> {
    return bdfClientGetImpieghi.call(this as unknown as BdfClientContext, codice);
  }

  // ============================================================
  // AGR - Sostanze Attive per filtri di ricerca
  // ============================================================

  /**
   * Lista sostanze attive per filtri di ricerca
   * GET /rest/bdf/agr/sostlist
   */
  public async getSostanzeAttive(params: BdfSostListParams): Promise<BdfSostanzaAttiva[]> {
    return bdfClientGetSostanzeAttive.call(this as unknown as BdfClientContext, params);
  }

  // ============================================================
  // AGR - Composizione per codice formulato commerciale
  // ============================================================

  /**
   * Composizione per codice formulato commerciale
   * GET /rest/bdf/agr/composiz?codice={codice}
   */
  public async getComposizione(codice: string): Promise<BdfComposizione[]> {
    return bdfClientGetComposizione.call(this as unknown as BdfClientContext, codice);
  }

  // ============================================================
  // AGR - Pittogrammi per codice formulato commerciale
  // ============================================================

  /**
   * Pittogrammi per codice formulato commerciale (returns HTML)
   * GET /rest/bdf/agr/pittogrammi?codice={codice}
   */
  public async getPittogrammi(codice: string): Promise<string> {
    return bdfClientGetPittogrammi.call(this as unknown as BdfClientContext, codice);
  }

  // ============================================================
  // AGR - Prodotti per filtri di ricerca
  // ============================================================

  /**
   * Lista prodotti per filtri di ricerca
   * GET /rest/bdf/agr/prodlist
   */
  public async getProdotti(params: BdfProdListParams): Promise<BdfProdotto[]> {
    return bdfClientGetProdotti.call(this as unknown as BdfClientContext, params);
  }

  // ============================================================
  // AGR - Tipologie
  // ============================================================

  /**
   * Lista tipologie
   * GET /rest/bdf/agr/tipologie
   */
  public async getTipologie(): Promise<BdfTipologia[]> {
    return bdfClientGetTipologie.call(this as unknown as BdfClientContext);
  }

  // ============================================================
  // AGR - Colture
  // ============================================================

  /**
   * Lista colture
   * GET /rest/bdf/agr/colture
   */
  public async getColture(): Promise<BdfColtura[]> {
    return bdfClientGetColture.call(this as unknown as BdfClientContext);
  }

  // ============================================================
  // AGR - Dettaglio singolo Prodotto per codice
  // ============================================================

  /**
   * Dettaglio singolo prodotto
   * GET /rest/bdf/agr/proddati/{id}
   */
  public async getProdottoDati(id: string): Promise<BdfProdottoDati[]> {
    return bdfClientGetProdottoDati.call(this as unknown as BdfClientContext, id);
  }

  // ============================================================
  // AGR - Dosi per prodotto/coltura/avversità
  // ============================================================

  /**
   * Lista dosi per prodotto/coltura/avversità
   * GET /rest/bdf/agr/dosi
   */
  public async getDosi(params: BdfDosiParams): Promise<BdfDose[]> {
    return bdfClientGetDosi.call(this as unknown as BdfClientContext, params);
  }
}

export function createBdfClient(): BdfClient {
  const baseUrl = process.env.URL_SERVER_BDF;
  const username = process.env.USERNAME_BDF;
  const password = process.env.PASSWORD_BDF;
  if (!baseUrl) throw new Error('URL_SERVER_BDF environment variable is required');
  if (!username) throw new Error('USERNAME_BDF environment variable is required');
  if (!password) throw new Error('PASSWORD_BDF environment variable is required');
  return new BdfClient({ baseUrl, username, password });
}
