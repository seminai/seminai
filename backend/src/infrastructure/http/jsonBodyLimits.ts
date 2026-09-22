import type { Express } from 'express';
import express from 'express';

export const LARGE_JSON_ROUTES: ReadonlyArray<{ readonly path: string; readonly limit: string }> = [
  { path: '/job-verification-agent', limit: '50mb' },
  { path: '/fields/bulk', limit: '5mb' },
  { path: '/production-units/bulk', limit: '5mb' },
  { path: '/onboarding', limit: '5mb' },
];

/** Mounts oversized JSON parsers on both unprefixed and `/api` paths. */
export function applyLargeJsonBodyParsers(app: Express): void {
  for (const route of LARGE_JSON_ROUTES) {
    app.use(route.path, express.json({ limit: route.limit }));
    app.use(`/api${route.path}`, express.json({ limit: route.limit }));
  }
}
