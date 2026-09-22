import type { Request } from 'express';
import { randomToken, verifyPkceS256 } from './crypto.js';
import type { AuthCodeRecord, OauthClientRecord, OauthStore } from './types.js';

const AUTH_CODE_TTL_SEC = 300;
const ACCESS_TOKEN_TTL_SEC = 3600;
const LOGIN_TTL_SEC = 86400;
const TRUSTED_REDIRECT_HOSTS = ['claude.ai', 'claude.com', 'chatgpt.com', 'openai.com'] as const;

export function isTrustedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    ) {
      return true;
    }
    if (url.protocol !== 'https:') {
      return false;
    }
    return TRUSTED_REDIRECT_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

export async function assertRedirectAllowed(
  store: OauthStore,
  clientId: string,
  redirectUri: string,
): Promise<void> {
  const client = await store.getClient(clientId);
  if (client && client.redirectUris.includes(redirectUri)) {
    return;
  }
  if (isTrustedRedirectUri(redirectUri)) {
    return;
  }
  throw new Error('redirect_uri is not registered for this client');
}

export function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function requestParams(request: Request): Record<string, unknown> {
  return { ...request.query, ...request.body };
}

export async function issueAuthCode(store: OauthStore, record: AuthCodeRecord): Promise<string> {
  const code = randomToken(24);
  await store.putAuthCode(code, record, AUTH_CODE_TTL_SEC);
  return code;
}

export async function exchangeAuthCode(
  store: OauthStore,
  input: {
    readonly code: string;
    readonly clientId: string;
    readonly redirectUri: string;
    readonly codeVerifier: string;
    readonly resource?: string;
  },
): Promise<{ token: string; expiresIn: number }> {
  const stored = await store.takeAuthCode(input.code);
  if (!stored) {
    throw new Error('invalid authorization code');
  }
  if (stored.clientId !== input.clientId || stored.redirectUri !== input.redirectUri) {
    throw new Error('authorization code mismatch');
  }
  if (input.resource && input.resource !== stored.resource) {
    throw new Error('resource mismatch');
  }
  if (!verifyPkceS256(input.codeVerifier, stored.codeChallenge)) {
    throw new Error('invalid PKCE verifier');
  }
  const token = randomToken(32);
  await store.putAccessToken(
    token,
    {
      seminaiJwt: stored.seminaiJwt,
      userId: stored.userId,
      email: stored.email,
      resource: stored.resource,
      clientId: stored.clientId,
    },
    ACCESS_TOKEN_TTL_SEC,
  );
  return { token, expiresIn: ACCESS_TOKEN_TTL_SEC };
}

export async function registerPublicClient(
  store: OauthStore,
  redirectUris: readonly string[],
): Promise<OauthClientRecord> {
  const client: OauthClientRecord = {
    clientId: `dcr_${randomToken(12)}`,
    redirectUris,
    tokenEndpointAuthMethod: 'none',
  };
  await store.putClient(client);
  return client;
}

export { LOGIN_TTL_SEC };
