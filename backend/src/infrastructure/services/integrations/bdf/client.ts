/**
 * BDF (Banca Dati Fitofarmaci) WS REST API Client
 *
 * Base URL: https://m.bdfup.it/
 * Auth: Basic Auth → JWT Bearer Token
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

import type {
  BdfAuthResponse,
  BdfAvversita,
  BdfClientConfig,
  BdfColtura,
  BdfComposizione,
  BdfDistributore,
  BdfDose,
  BdfDosiParams,
  BdfImpiego,
  BdfProdListParams,
  BdfProdotto,
  BdfProdottoDati,
  BdfSostanzaAttiva,
  BdfSostanzaAttivaDati,
  BdfSostListParams,
  BdfTipologia,
} from './types';

export class BdfClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private accessToken: string | null = null;

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
    const authUrl = `${this.baseUrl}/rest/bdf/auth`;

    console.log(`[BDF] Authenticating to ${authUrl} (user: ${this.username})`);

    // Use curl via child_process — the BDF WiRL/Delphi server is case-sensitive
    // and rejects lowercase "authorization" headers (HTTP/2 lowercases them).
    // curl preserves header casing. We use async exec to avoid blocking the event loop.
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    let responseText: string;
    try {
      const { stdout } = await execAsync(
        `curl -s -X POST -H "Authorization: Basic ${credentials}" -H "Accept: application/json" "${authUrl}"`,
        { encoding: 'utf-8', timeout: 15000 },
      );
      responseText = stdout;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`BDF auth network error: ${msg}`);
    }

    let data: BdfAuthResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`BDF auth failed: invalid response - ${responseText}`);
    }

    if ('status' in data && (data as Record<string, unknown>).status !== 200 && !data.success) {
      throw new Error(`BDF auth failed: ${responseText}`);
    }
    if (!data.success || !data.access_token) {
      throw new Error('BDF auth failed: invalid response');
    }

    this.accessToken = data.access_token;
    return data.access_token;
  }

  // ============================================================
  // HTTP Request Helper
  // ============================================================

  private async curlGet(url: string): Promise<string> {
    const { stdout } = await execAsync(
      `curl -s -H "Authorization: Bearer ${this.accessToken}" -H "Accept: application/json" "${url}"`,
      { encoding: 'utf-8', timeout: 30000 },
    );
    return stdout;
  }

  private async request<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    let responseText: string;
    try {
      responseText = await this.curlGet(url.toString());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`BDF API error on ${endpoint}: ${msg}`);
    }

    try {
      return JSON.parse(responseText) as T;
    } catch {
      throw new Error(`BDF API invalid JSON on ${endpoint}: ${responseText.slice(0, 200)}`);
    }
  }

  private async requestText(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<string> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    try {
      return await this.curlGet(url.toString());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`BDF API error on ${endpoint}: ${msg}`);
    }
  }

  // ============================================================
  // AGR - Avversità per codice coltura
  // ============================================================

  /**
   * Lista avversità per codice coltura
   * GET /rest/bdf/agr/avversita?coltura={coltura}
   */
  public async getAvversita(coltura: string | number): Promise<BdfAvversita[]> {
    return this.request<BdfAvversita[]>('/rest/bdf/agr/avversita', {
      coltura: String(coltura),
    });
  }

  // ============================================================
  // AGR - Distributori per codice formulato commerciale
  // ============================================================

  /**
   * Lista distributori per codice formulato commerciale
   * GET /rest/bdf/agr/azidistr?codice={codice}
   */
  public async getDistributori(codice: string): Promise<BdfDistributore[]> {
    return this.request<BdfDistributore[]>('/rest/bdf/agr/azidistr', { codice });
  }

  // ============================================================
  // AGR - Dettaglio singola Sostanza attiva per codice
  // ============================================================

  /**
   * Dettaglio singola sostanza attiva
   * GET /rest/bdf/agr/sostdati/{id}
   */
  public async getSostanzaAttivaDati(id: string): Promise<BdfSostanzaAttivaDati[]> {
    return this.request<BdfSostanzaAttivaDati[]>(`/rest/bdf/agr/sostdati/${id}`);
  }

  // ============================================================
  // AGR - Colture autorizzate per codice formulato commerciale
  // ============================================================

  /**
   * Lista colture autorizzate per il codice formulato commerciale
   * GET /rest/bdf/agr/impieghi?tipo=P&codice={codice}
   */
  public async getImpieghi(codice: string): Promise<BdfImpiego[]> {
    return this.request<BdfImpiego[]>('/rest/bdf/agr/impieghi', {
      tipo: 'P',
      codice,
    });
  }

  // ============================================================
  // AGR - Sostanze Attive per filtri di ricerca
  // ============================================================

  /**
   * Lista sostanze attive per filtri di ricerca
   * GET /rest/bdf/agr/sostlist
   */
  public async getSostanzeAttive(params: BdfSostListParams): Promise<BdfSostanzaAttiva[]> {
    return this.request<BdfSostanzaAttiva[]>('/rest/bdf/agr/sostlist', {
      ricalfa: params.ricalfa,
      dettbio: params.dettbio,
      coltura: params.coltura,
      tipologia: params.tipologia,
      codSA: params.codSA,
    });
  }

  // ============================================================
  // AGR - Composizione per codice formulato commerciale
  // ============================================================

  /**
   * Composizione per codice formulato commerciale
   * GET /rest/bdf/agr/composiz?codice={codice}
   */
  public async getComposizione(codice: string): Promise<BdfComposizione[]> {
    return this.request<BdfComposizione[]>('/rest/bdf/agr/composiz', { codice });
  }

  // ============================================================
  // AGR - Pittogrammi per codice formulato commerciale
  // ============================================================

  /**
   * Pittogrammi per codice formulato commerciale (returns HTML)
   * GET /rest/bdf/agr/pittogrammi?codice={codice}
   */
  public async getPittogrammi(codice: string): Promise<string> {
    return this.requestText('/rest/bdf/agr/pittogrammi', { codice });
  }

  // ============================================================
  // AGR - Prodotti per filtri di ricerca
  // ============================================================

  /**
   * Lista prodotti per filtri di ricerca
   * GET /rest/bdf/agr/prodlist
   */
  public async getProdotti(params: BdfProdListParams): Promise<BdfProdotto[]> {
    return this.request<BdfProdotto[]>('/rest/bdf/agr/prodlist', {
      ricalfa: params.ricalfa,
      dettbio: params.dettbio,
      coltura: params.coltura,
      avversita: params.avversita,
      tipologia: params.tipologia,
      codSA: params.codSA,
    });
  }

  // ============================================================
  // AGR - Tipologie
  // ============================================================

  /**
   * Lista tipologie
   * GET /rest/bdf/agr/tipologie
   */
  public async getTipologie(): Promise<BdfTipologia[]> {
    return this.request<BdfTipologia[]>('/rest/bdf/agr/tipologie');
  }

  // ============================================================
  // AGR - Colture
  // ============================================================

  /**
   * Lista colture
   * GET /rest/bdf/agr/colture
   */
  public async getColture(): Promise<BdfColtura[]> {
    return this.request<BdfColtura[]>('/rest/bdf/agr/colture');
  }

  // ============================================================
  // AGR - Dettaglio singolo Prodotto per codice
  // ============================================================

  /**
   * Dettaglio singolo prodotto
   * GET /rest/bdf/agr/proddati/{id}
   */
  public async getProdottoDati(id: string): Promise<BdfProdottoDati[]> {
    return this.request<BdfProdottoDati[]>(`/rest/bdf/agr/proddati/${id}`);
  }

  // ============================================================
  // AGR - Dosi per prodotto/coltura/avversità
  // ============================================================

  /**
   * Lista dosi per prodotto/coltura/avversità
   * GET /rest/bdf/agr/dosi
   */
  public async getDosi(params: BdfDosiParams): Promise<BdfDose[]> {
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
}

/**
 * Factory function to create a BdfClient from environment variables
 */
export function createBdfClient(): BdfClient {
  const baseUrl = process.env.URL_SERVER_BDF;
  const username = process.env.USERNAME_BDF;
  const password = process.env.PASSWORD_BDF;

  if (!baseUrl) throw new Error('URL_SERVER_BDF environment variable is required');
  if (!username) throw new Error('USERNAME_BDF environment variable is required');
  if (!password) throw new Error('PASSWORD_BDF environment variable is required');

  return new BdfClient({ baseUrl, username, password });
}
