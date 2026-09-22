import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'seminai_mcp_login';

export function signCookieValue(value: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(value).digest('hex');
  return `${value}.${signature}`;
}

export function unsignCookieValue(signed: string, secret: string): string | null {
  const splitAt = signed.lastIndexOf('.');
  if (splitAt <= 0) {
    return null;
  }
  const value = signed.slice(0, splitAt);
  const expected = signCookieValue(value, secret);
  const left = Buffer.from(signed);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  return value;
}

export function readLoginCookie(request: Request, secret: string): string | null {
  const header = request.headers.cookie ?? '';
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) {
    return null;
  }
  const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  return unsignCookieValue(raw, secret);
}

export function setLoginCookie(response: Response, sessionId: string, secret: string): void {
  const signed = encodeURIComponent(signCookieValue(sessionId, secret));
  response.setHeader(
    'Set-Cookie',
    [
      `${COOKIE_NAME}=${signed}`,
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Path=/',
      'Max-Age=86400',
    ].join('; '),
  );
}
