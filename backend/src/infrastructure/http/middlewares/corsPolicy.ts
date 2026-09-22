import type { CorsOptions } from 'cors';
import type { NextFunction, Request, Response } from 'express';

function normalizeCorsOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function parseOriginEnvVars(): string[] {
  const configured = [
    process.env.CORS_ORIGINS,
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.API_PUBLIC_ORIGIN,
    process.env.BACKEND_URL,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.includes('*')) {
    return configured.filter((origin) => origin !== '*');
  }

  return configured;
}

export function buildAllowedOrigins(): readonly string[] {
  const normalized = parseOriginEnvVars()
    .map(normalizeCorsOrigin)
    .filter((origin): origin is string => Boolean(origin));
  return [...new Set(normalized)];
}

function getRequestHost(request: Request): string | undefined {
  const forwardedHost = request.headers['x-forwarded-host'];
  if (typeof forwardedHost === 'string' && forwardedHost.length > 0) {
    return forwardedHost.split(',')[0]?.trim();
  }
  return request.headers.host;
}

function isSameHostOrigin(origin: string, requestHost: string): boolean {
  try {
    const originHost = new URL(origin).host;
    const hostWithoutPort = requestHost.split(':')[0];
    return originHost === requestHost || originHost === hostWithoutPort;
  } catch {
    return false;
  }
}

export function isOriginAllowed(
  origin: string | undefined,
  requestHost: string | undefined,
): boolean {
  if (!origin) {
    return true;
  }

  const requestOrigin = normalizeCorsOrigin(origin);
  if (!requestOrigin) {
    return false;
  }

  if (buildAllowedOrigins().includes(requestOrigin)) {
    return true;
  }

  if (requestHost && isSameHostOrigin(origin, requestHost)) {
    return true;
  }

  return false;
}

export function createCorsOptions(): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const requestOrigin = normalizeCorsOrigin(origin);
      if (requestOrigin && buildAllowedOrigins().includes(requestOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  };
}

export function createCorsMiddleware() {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.headers.origin;
    const host = getRequestHost(request);

    if (!isOriginAllowed(origin, host)) {
      next(new Error(`Origin ${origin} not allowed by CORS`));
      return;
    }

    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Credentials', 'true');
      response.setHeader('Vary', 'Origin');
    }

    if (request.method === 'OPTIONS') {
      const requestHeaders = request.headers['access-control-request-headers'];
      response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
      response.setHeader(
        'Access-Control-Allow-Headers',
        typeof requestHeaders === 'string'
          ? requestHeaders
          : 'Content-Type, Authorization, X-Api-Key',
      );
      response.status(204).end();
      return;
    }

    next();
  };
}
