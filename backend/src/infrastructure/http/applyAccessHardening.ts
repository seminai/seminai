import { networkInterfaces } from 'node:os';
import type { Express } from 'express';
import helmet from 'helmet';
import { resolveAccessMode } from '../runtime/resolvePublicBaseUrl';

export function shouldTrustProxy(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.TRUST_PROXY === 'true' || resolveAccessMode(env) === 'public';
}

export function shouldEnableHsts(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return resolveAccessMode(env) === 'public';
}

/** Trust proxy, Helmet, and HSTS when the instance is exposed beyond LAN. */
export function applyAccessHardening(
  app: Express,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (env.RUNTIME_PROFILE === 'desktop') {
    const hosts = new Set(['127.0.0.1', 'localhost', '[::1]', ...Object.values(networkInterfaces()).flat().filter(Boolean).map(item => item!.address)]);
    app.use((request, response, next) => {
      const host = (request.headers.host || '').replace(/:\d+$/, '');
      if (!hosts.has(host)) { response.status(403).json({ code: 'INVALID_HOST', message: 'Host non autorizzato' }); return; }
      next();
    });
  }
  if (shouldTrustProxy(env)) {
    app.set('trust proxy', 1);
  }
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: shouldEnableHsts(env)
        ? { maxAge: 15_552_000, includeSubDomains: true, preload: false }
        : false,
    }),
  );
}
