import { type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';

/**
 * Validates that the inbound webhook carries the expected shared secret.
 * Accepts the secret via:
 *   - HTTP Basic Auth password (any username)
 *   - `?token=...` query string
 *   - `X-Webhook-Token` header
 *
 * Returns 503 if SENDGRID_INBOUND_WEBHOOK_TOKEN is not configured.
 * Returns 401 if the supplied token doesn't match.
 */
export function sendgridInboundAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const expected = process.env.SENDGRID_INBOUND_WEBHOOK_TOKEN;
  if (!expected) {
    response.status(503).json({ status: 'error', message: 'Inbound email webhook not configured' });
    return;
  }
  const provided = extractToken(request);
  if (!provided || !constantTimeEqual(provided, expected)) {
    response.status(401).json({ status: 'error', message: 'Unauthorized' });
    return;
  }
  next();
}

function extractToken(request: Request): string | null {
  const fromHeader = request.header('x-webhook-token');
  if (fromHeader) return fromHeader.trim();
  const fromQuery = request.query.token;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;
  const authHeader = request.header('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon >= 0) return decoded.slice(colon + 1);
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = new Uint8Array(Buffer.from(a));
  const bufB = new Uint8Array(Buffer.from(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
