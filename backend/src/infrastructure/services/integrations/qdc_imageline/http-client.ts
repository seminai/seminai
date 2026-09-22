/**
 * Low-level HTTP client for the ImageLine QuadernoDiCampagna (QDC) REST API.
 *
 * Base URL: https://servizi.imagelinenetwork.com/rest/qdc/v2/integrazioni
 * Documentation: https://servizi.imagelinenetwork.com/rest/qdc/v2/integrazioni/help
 *
 * GET parameters go in the query string; POST bodies are form-encoded.
 * Number arrays (e.g. `lista_id_unita`) are serialized as comma-separated lists.
 */

import { QdcApiError } from './errors';
import type { QdcApiResponse, QdcParams, QdcParamValue } from './types';

const BASE_URL = 'https://servizi.imagelinenetwork.com/rest/qdc/v2/integrazioni';

interface QdcHttpClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class QdcHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private accessToken: string | null = null;

  constructor(options: QdcHttpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  public setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Performs an authenticated request against the QDC API and returns the
   * standard `{message, result}` envelope. Throws `QdcApiError` on non-2xx.
   */
  public async request<T = unknown>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    params?: QdcParams,
  ): Promise<QdcApiResponse<T>> {
    return this.requestRaw<QdcApiResponse<T>>(endpoint, method, params);
  }

  /**
   * Performs an authenticated request returning the raw JSON body, for the few
   * endpoints that skip the `{message, result}` envelope (e.g. /getscadenze).
   * The access token travels as the `access_token` query parameter (as
   * documented by QDC). Throws `QdcApiError` on non-2xx responses.
   */
  public async requestRaw<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    params?: QdcParams,
  ): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Access token not set. Call setAccessToken() first.');
    }
    const url = new URL(`${this.baseUrl}${endpoint}`);
    url.searchParams.append('access_token', this.accessToken);
    const headers: Record<string, string> = { Accept: 'application/json' };
    const options: RequestInit = { method, headers };
    if (method === 'GET' && params) {
      appendSearchParams(url, params);
    }
    if (method === 'POST' && params) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.body = buildFormBody(params);
    }
    const response = await this.fetchImpl(url.toString(), options);
    if (!response.ok) {
      throw await buildApiError(response);
    }
    return response.json() as Promise<T>;
  }
}

function serializeParamValue(value: Exclude<QdcParamValue, undefined>): string {
  return Array.isArray(value) ? value.join(',') : String(value);
}

function appendSearchParams(url: URL, params: QdcParams): void {
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, serializeParamValue(value));
    }
  });
}

function buildFormBody(params: QdcParams): string {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      body.append(key, serializeParamValue(value));
    }
  });
  return body.toString();
}

async function buildApiError(response: Response): Promise<QdcApiError> {
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    error_description?: string;
    error_reason?: string;
  };
  return new QdcApiError({
    httpStatus: response.status,
    code: data.error,
    errorDescription: data.error_description || data.error_reason || response.statusText,
  });
}
