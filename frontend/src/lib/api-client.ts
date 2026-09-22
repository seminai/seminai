import { getApiBaseUrl } from './api-base-url';

interface RequestConfig {
  readonly url: string;
  readonly method: string;
  readonly headers?: Record<string, string>;
  readonly data?: unknown;
  readonly params?: Record<string, string>;
  readonly signal?: AbortSignal;
}

interface ApiErrorBody {
  readonly message?: string;
  readonly code?: string;
  readonly errors?: ReadonlyArray<{ readonly msg: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? `API error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function isAuthEndpoint(path: string): boolean {
  return (
    path.startsWith('/auth/forgot-password') ||
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/reset-password') ||
    path === '/auth/me' ||
    path.startsWith('/setup') ||
    path === '/config/public'
  );
}

function buildRequestFromConfig(config: RequestConfig): { url: string; init: RequestInit } {
  const requestUrl = new URL(`${getApiBaseUrl()}${config.url}`, window.location.origin);

  if (config.params) {
    Object.entries(config.params).forEach(([key, value]) => {
      requestUrl.searchParams.set(key, value);
    });
  }

  return {
    url: requestUrl.toString(),
    init: {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: config.data ? JSON.stringify(config.data) : undefined,
      credentials: 'include',
      signal: config.signal,
    },
  };
}

function buildRequestFromUrl(url: string, init?: RequestInit): { url: string; init: RequestInit } {
  const requestUrl = new URL(`${getApiBaseUrl()}${url}`, window.location.origin);
  return {
    url: requestUrl.toString(),
    init: {
      ...init,
      credentials: 'include',
    },
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

let unauthorizedFired = false;

async function throwApiError(response: Response, requestPath: string): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (response.status === 401 && !isAuthEndpoint(requestPath) && !unauthorizedFired) {
    unauthorizedFired = true;
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    setTimeout(() => { unauthorizedFired = false; }, 1000);
  }
  throw new ApiError(response.status, body);
}

export interface UploadProgressEvent {
  readonly loaded: number;
  readonly total: number;
  readonly percent: number;
}

export interface MultipartFetchOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly onUploadProgress?: (event: UploadProgressEvent) => void;
}

const DEFAULT_UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Upload a FormData payload (multipart/form-data).
 * Does NOT set Content-Type — the browser auto-sets the boundary.
 *
 * Uses XMLHttpRequest when an `onUploadProgress` callback is provided
 * (only API that exposes upload byte-level progress); otherwise falls
 * back to fetch. A default 5-minute timeout is enforced unless
 * overridden via `timeoutMs`.
 */
export async function multipartFetch<T>(
  url: string,
  formData: FormData,
  options: MultipartFetchOptions = {},
): Promise<T> {
  if (options.onUploadProgress) {
    return multipartFetchWithProgress<T>(url, formData, options);
  }
  return multipartFetchWithFetch<T>(url, formData, options);
}

async function multipartFetchWithFetch<T>(
  url: string,
  formData: FormData,
  options: MultipartFetchOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  const requestUrl = new URL(`${getApiBaseUrl()}${url}`, window.location.origin);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(timeoutReason(timeoutMs)), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort(options.signal.reason);
    else options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
  }
  try {
    const response = await fetch(requestUrl.toString(), {
      method: 'POST',
      body: formData,
      credentials: 'include',
      signal: controller.signal,
    });
    if (!response.ok) return throwApiError(response, url);
    return parseResponse<T>(response);
  } finally {
    clearTimeout(timeoutId);
  }
}

function multipartFetchWithProgress<T>(
  url: string,
  formData: FormData,
  options: MultipartFetchOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const requestUrl = new URL(`${getApiBaseUrl()}${url}`, window.location.origin);
    const timeoutMs = options.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', requestUrl.toString(), true);
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      options.onUploadProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded / event.total) * 100),
      });
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(parseXhrJsonBody<T>(xhr));
        return;
      }
      const body = safeParseJson(xhr.responseText) as ApiErrorBody;
      maybeFireUnauthorized(xhr.status, url);
      reject(new ApiError(xhr.status, body));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('timeout', () =>
      reject(new Error(`Upload timed out after ${timeoutMs}ms`)),
    );
    xhr.addEventListener('abort', () =>
      reject(new DOMException(String(options.signal?.reason ?? 'Aborted'), 'AbortError')),
    );
    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(formData);
  });
}

function parseXhrJsonBody<T>(xhr: XMLHttpRequest): T {
  if (xhr.status === 204 || !xhr.responseText) return undefined as T;
  return JSON.parse(xhr.responseText) as T;
}

function safeParseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function maybeFireUnauthorized(status: number, requestPath: string): void {
  if (status !== 401 || isAuthEndpoint(requestPath) || unauthorizedFired) return;
  unauthorizedFired = true;
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  setTimeout(() => {
    unauthorizedFired = false;
  }, 1000);
}

function timeoutReason(timeoutMs: number): DOMException {
  return new DOMException(`Upload timed out after ${timeoutMs}ms`, 'TimeoutError');
}

export function customFetch<T>(config: RequestConfig): Promise<T>;
export function customFetch<T>(url: string, init?: RequestInit): Promise<T>;
export async function customFetch<T>(
  configOrUrl: RequestConfig | string,
  init?: RequestInit,
): Promise<T> {
  const isGeneratedCall = typeof configOrUrl === 'string';
  const requestPath = isGeneratedCall ? configOrUrl : configOrUrl.url;
  const request =
    isGeneratedCall
      ? buildRequestFromUrl(configOrUrl, init)
      : buildRequestFromConfig(configOrUrl);

  const response = await fetch(request.url, request.init);
  if (!response.ok) {
    return throwApiError(response, requestPath);
  }

  const body = await parseResponse<unknown>(response);
  if (isGeneratedCall) {
    // Orval-generated clients expect a wrapped shape: { data, status, headers }.
    return {
      data: body,
      status: response.status,
      headers: response.headers,
    } as T;
  }

  return body as T;
}
