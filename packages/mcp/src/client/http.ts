import {
  SeminaiAuthError,
  SeminaiHttpError,
  SeminaiNotFoundError,
  SeminaiTimeoutError,
} from './http-errors.js';

export interface SeminaiHttpClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | readonly number[] | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * Per-request timeout in ms. Overrides the client default. Use this for
   * endpoints known to be LLM-bound (e.g. /agent-chat/*) where 30s is too
   * tight.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class SeminaiHttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SeminaiHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', path, options);
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  private async request<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const effectiveTimeoutMs = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    const signal = options.signal ?? controller.signal;
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: this.buildHeaders(options.headers, options.body !== undefined),
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal,
      });
      return await this.parseResponse<T>(response);
    } catch (err) {
      if (this.isAbortError(err)) {
        throw new SeminaiTimeoutError(effectiveTimeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query: RequestOptions['query']): string {
    const url = new URL(path.startsWith('/') ? path : `/${path}`, `${this.baseUrl}/`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(
    extra: Record<string, string> | undefined,
    hasBody: boolean,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
      ...extra,
    };
    if (hasBody) headers['Content-Type'] = 'application/json';
    return headers;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const payload: unknown = isJson
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');
    if (response.ok) return payload as T;
    if (response.status === 401) throw new SeminaiAuthError(payload);
    if (response.status === 404) throw new SeminaiNotFoundError(payload);
    throw new SeminaiHttpError(
      response.status,
      `Seminai API ${response.status} ${response.statusText}`,
      payload,
    );
  }

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
  }
}
