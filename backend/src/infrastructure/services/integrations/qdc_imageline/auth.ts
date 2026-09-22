/**
 * Authentication helpers for ImageLine QuadernoDiCampagna (QDC) API.
 *
 * QDC only supports the Authorization Code Grant, exposed on the SAME base
 * path as the API (`/rest/qdc/v2/integrazioni/auth` and `/token`). For
 * server-to-server use, calling GET /auth WITHOUT redirect_uri returns the
 * authorization code directly as JSON, which is then exchanged on POST /token.
 * Scopes are comma-separated.
 */

import { QdcImageLineRestApi } from './rest_api';
import { QDC_ALL_SCOPES } from './types';
import type { QdcScope } from './types';

const BASE_URL = 'https://servizi.imagelinenetwork.com/rest/qdc/v2/integrazioni';
const TOKEN_EXPIRY_BUFFER_SECONDS = 300;
const DEFAULT_TOKEN_TTL_SECONDS = 3600;
const LEGACY_SCOPES: readonly QdcScope[] = ['r_magazzini', 'w_magazzini'] as const;

interface TokenCache {
  token: string;
  expiresAt: number;
}

export interface QdcAuthOptions {
  readonly scopes?: readonly QdcScope[];
  readonly fetchImpl?: typeof fetch;
}

interface QdcAuthErrorBody {
  error?: string;
  error_description?: string;
  error_reason?: string;
}

type AuthCodeResult =
  | { readonly ok: true; readonly code: string }
  | {
      readonly ok: false;
      readonly error?: string;
      readonly errorDescription?: string;
      readonly httpStatus: number;
    };

// In-memory token cache keyed by `${clientId}:${scopeString}` (consider Redis in production)
const tokenCache: Map<string, TokenCache> = new Map();

function resolveFetch(options: QdcAuthOptions): typeof fetch {
  return options.fetchImpl ?? globalThis.fetch.bind(globalThis);
}

/** GET /auth without redirect_uri → the authorization code comes back as JSON. */
async function requestAuthorizationCode(
  clientId: string,
  scopeString: string,
  fetchImpl: typeof fetch,
): Promise<AuthCodeResult> {
  const url = new URL(`${BASE_URL}/auth`);
  url.searchParams.append('client_id', clientId);
  url.searchParams.append('scope', scopeString);
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = (await response.json().catch(() => ({}))) as QdcAuthErrorBody & { code?: string };
  if (!response.ok || !data.code) {
    return {
      ok: false,
      error: data.error,
      errorDescription: data.error_description || data.error_reason,
      httpStatus: response.status,
    };
  }
  return { ok: true, code: data.code };
}

/** POST /token — exchanges the authorization code for an access token. */
async function exchangeCodeForAccessToken(
  clientId: string,
  code: string,
  fetchImpl: typeof fetch,
  requestedScope?: string,
): Promise<{ token: string; expiresIn: number }> {
  const response = await fetchImpl(`${BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId }).toString(),
  });
  const data = (await response.json().catch(() => ({}))) as QdcAuthErrorBody & {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(
      `Failed to get token: ${data.error_description || data.error || `HTTP ${response.status}`}`,
    );
  }
  if (requestedScope && data.scope && data.scope !== requestedScope) {
    console.warn(
      `[qdc] granted scopes "${data.scope}" differ from requested "${requestedScope}" (license may lack modules)`,
    );
  }
  return { token: data.access_token, expiresIn: data.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS };
}

/**
 * Get access token from client ID (auth-code flow without redirect).
 * Defaults to requesting every QDC scope; when the license lacks modules and
 * the server rejects with `invalid_scope`, retries once with the legacy
 * warehouse-only scope pair. Tokens are cached per clientId+scope set.
 * @param clientId ImageLine QDC client ID
 * @returns Access token
 */
export async function getTokenFromClientId(
  clientId: string,
  options: QdcAuthOptions = {},
): Promise<string> {
  const scopeString = (options.scopes ?? QDC_ALL_SCOPES).join(',');
  const cacheKey = `${clientId}:${scopeString}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  const fetchImpl = resolveFetch(options);
  const legacyScopeString = LEGACY_SCOPES.join(',');
  let effectiveScope = scopeString;
  let auth = await requestAuthorizationCode(clientId, scopeString, fetchImpl);
  if (!auth.ok && auth.error === 'invalid_scope' && scopeString !== legacyScopeString) {
    console.warn(
      `[qdc] invalid_scope requesting "${scopeString}" (license may lack modules), retrying with "${legacyScopeString}"`,
    );
    effectiveScope = legacyScopeString;
    auth = await requestAuthorizationCode(clientId, effectiveScope, fetchImpl);
  }
  if (!auth.ok) {
    throw new Error(
      `Failed to get authorization code: ${auth.errorDescription || auth.error || `HTTP ${auth.httpStatus}`}`,
    );
  }
  const granted = await exchangeCodeForAccessToken(clientId, auth.code, fetchImpl, effectiveScope);
  const expiresAt = Date.now() + (granted.expiresIn - TOKEN_EXPIRY_BUFFER_SECONDS) * 1000;
  tokenCache.set(cacheKey, { token: granted.token, expiresAt });
  return granted.token;
}

/**
 * Get configured QDC API instance from client ID
 * @param clientId ImageLine QDC client ID
 * @returns Configured QdcImageLineRestApi instance
 */
export async function getQdcApiFromClientId(
  clientId: string,
  options: QdcAuthOptions = {},
): Promise<QdcImageLineRestApi> {
  const token = await getTokenFromClientId(clientId, options);
  const api = new QdcImageLineRestApi({ fetchImpl: options.fetchImpl });
  api.setAccessToken(token);
  return api;
}

/**
 * Clear cached tokens for a specific client (every scope combination).
 * @param clientId Client ID to clear
 */
export function clearTokenCache(clientId: string): void {
  const prefix = `${clientId}:`;
  Array.from(tokenCache.keys())
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => tokenCache.delete(key));
}

/**
 * Clear all token cache
 */
export function clearAllTokenCache(): void {
  tokenCache.clear();
}

/**
 * OAuth2 Authorization Code Flow helper (interactive variant with redirect_uri,
 * for flows where a user authorizes in the browser).
 */
export class QdcOAuthFlow {
  private clientId: string;
  private redirectUri: string;

  constructor(clientId: string, redirectUri: string) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
  }

  /**
   * Generate authorization URL for the user to visit
   * @param scopes Scopes to request (comma-separated on the wire)
   * @param state Optional state for CSRF protection
   */
  public getAuthorizationUrl(scopes: readonly QdcScope[] = QDC_ALL_SCOPES, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes.join(','),
    });
    if (state) {
      params.append('state', state);
    }
    return `${BASE_URL}/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code (received on the redirect_uri) for an access token
   * @param code Authorization code from callback
   */
  public async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const granted = await exchangeCodeForAccessToken(
      this.clientId,
      code,
      globalThis.fetch.bind(globalThis),
    );
    return { accessToken: granted.token, expiresIn: granted.expiresIn };
  }
}
