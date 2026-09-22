import path from 'node:path';
import type { Express, Request, Response, NextFunction } from 'express';
import express from 'express';

const API_PREFIXES = ['/api', '/socket.io', '/api-docs', '/developer', '/health', '/wake-up'] as const;

export function shouldBypassSpa(requestPath: string, method: string): boolean {
  if (method !== 'GET') {
    return true;
  }
  return API_PREFIXES.some((prefix) => requestPath === prefix || requestPath.startsWith(`${prefix}/`));
}

/** Serves the built SPA and falls back to index.html for client routes. */
export function mountSpaFallback(app: Express, spaDir: string): void {
  const indexFile = path.join(spaDir, 'index.html');
  app.use(express.static(spaDir));
  app.get('*', (request: Request, response: Response, next: NextFunction) => {
    if (shouldBypassSpa(request.path, request.method)) {
      return next();
    }
    return response.sendFile(indexFile);
  });
}
