import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import type { HttpMcpConfig } from '../http-config.js';
import { randomToken } from './crypto.js';
import { readLoginCookie, setLoginCookie } from './cookies.js';
import {
  assertRedirectAllowed,
  exchangeAuthCode,
  issueAuthCode,
  LOGIN_TTL_SEC,
  readString,
  registerPublicClient,
  requestParams,
} from './flow.js';
import { renderLoginPage } from './login-page.js';
import { oauthAuthorizationServerMetadata, oauthProtectedResourceMetadata } from './metadata.js';
import { loginToSeminai } from './seminai-login.js';
import type { OauthStore } from './types.js';

export function createOauthRouter(config: HttpMcpConfig, store: OauthStore): Router {
  const router = createRouter();
  router.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json(oauthAuthorizationServerMetadata(config));
  });
  router.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json(oauthProtectedResourceMetadata(config));
  });
  router.post('/oauth/register', (req, res) => void handleRegister(req, res, store));
  router.get('/oauth/authorize', (req, res) => void handleAuthorizeGet(req, res, config, store));
  router.post('/oauth/login', (req, res) => void handleLogin(req, res, config, store));
  router.post('/oauth/token', (req, res) => void handleToken(req, res, store));
  return router;
}

async function handleRegister(
  request: Request,
  response: Response,
  store: OauthStore,
): Promise<void> {
  const body = request.body as { redirect_uris?: unknown };
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((item): item is string => typeof item === 'string')
    : [];
  if (redirectUris.length === 0) {
    response.status(400).json({ error: 'invalid_client_metadata' });
    return;
  }
  const client = await registerPublicClient(store, redirectUris);
  response.status(201).json({
    client_id: client.clientId,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  });
}

async function handleAuthorizeGet(
  request: Request,
  response: Response,
  config: HttpMcpConfig,
  store: OauthStore,
): Promise<void> {
  const params = requestParams(request);
  const clientId = readString(params, 'client_id');
  const redirectUri = readString(params, 'redirect_uri');
  const challenge = readString(params, 'code_challenge');
  const method = readString(params, 'code_challenge_method');
  if (!clientId || !redirectUri || !challenge || method !== 'S256') {
    response.status(400).send('Missing client_id, redirect_uri or PKCE S256 code_challenge');
    return;
  }
  try {
    await assertRedirectAllowed(store, clientId, redirectUri);
  } catch (error) {
    response.status(400).send((error as Error).message);
    return;
  }
  const loginId = readLoginCookie(request, config.oauthSigningKey);
  const session = loginId ? await store.getLoginSession(loginId) : null;
  if (!session) {
    response.type('html').send(renderLoginPage({ query: request.url.split('?')[1] ?? '' }));
    return;
  }
  await completeAuthorize(response, store, config, params, session);
}

async function handleLogin(
  request: Request,
  response: Response,
  config: HttpMcpConfig,
  store: OauthStore,
): Promise<void> {
  const body = requestParams(request);
  const email = readString(body, 'email');
  const password = readString(body, 'password');
  const returnQuery = readString(body, 'return_query') ?? '';
  if (!email || !password) {
    response
      .status(400)
      .type('html')
      .send(renderLoginPage({ error: 'Email and password are required', query: returnQuery }));
    return;
  }
  try {
    const logged = await loginToSeminai(config.apiBaseUrl, email, password);
    const session = { seminaiJwt: logged.token, userId: logged.userId, email: logged.email };
    const sessionId = randomToken(16);
    await store.putLoginSession(sessionId, session, LOGIN_TTL_SEC);
    setLoginCookie(response, sessionId, config.oauthSigningKey);
    const params = Object.fromEntries(new URLSearchParams(returnQuery).entries());
    await completeAuthorize(response, store, config, params, session);
  } catch (error) {
    response
      .status(401)
      .type('html')
      .send(renderLoginPage({ error: (error as Error).message, query: returnQuery }));
  }
}

async function completeAuthorize(
  response: Response,
  store: OauthStore,
  config: HttpMcpConfig,
  params: Record<string, unknown>,
  session: { seminaiJwt: string; userId: string; email: string },
): Promise<void> {
  const clientId = readString(params, 'client_id') ?? '';
  const redirectUri = readString(params, 'redirect_uri') ?? '';
  const state = readString(params, 'state');
  const challenge = readString(params, 'code_challenge') ?? '';
  const resource = readString(params, 'resource') ?? config.resourceUrl;
  const seminaiJwt = session.seminaiJwt;
  const code = await issueAuthCode(store, {
    clientId,
    redirectUri,
    codeChallenge: challenge,
    resource,
    seminaiJwt,
    userId: session.userId,
    email: session.email,
  });
  const target = new URL(redirectUri);
  target.searchParams.set('code', code);
  if (state) {
    target.searchParams.set('state', state);
  }
  response.redirect(target.toString());
}

async function handleToken(request: Request, response: Response, store: OauthStore): Promise<void> {
  const params = requestParams(request);
  const grant = readString(params, 'grant_type');
  const code = readString(params, 'code');
  const clientId = readString(params, 'client_id');
  const redirectUri = readString(params, 'redirect_uri');
  const verifier = readString(params, 'code_verifier');
  if (grant !== 'authorization_code' || !code || !clientId || !redirectUri || !verifier) {
    response.status(400).json({ error: 'invalid_request' });
    return;
  }
  try {
    const issued = await exchangeAuthCode(store, {
      code,
      clientId,
      redirectUri,
      codeVerifier: verifier,
      resource: readString(params, 'resource'),
    });
    response.json({
      access_token: issued.token,
      token_type: 'Bearer',
      expires_in: issued.expiresIn,
      scope: 'seminai',
    });
  } catch (error) {
    response
      .status(400)
      .json({ error: 'invalid_grant', error_description: (error as Error).message });
  }
}
