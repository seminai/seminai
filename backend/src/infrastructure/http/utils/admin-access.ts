import { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { getJwtSecret } from '../../../utils/get-jwt-secret';

export const ADMIN_ACCESS_COOKIE_NAME = 'admin_access_token';
export const ADMIN_ACCESS_DURATION_MS = 30 * 60 * 1000;

interface AdminAccessTokenPayload {
  readonly userId: string;
  readonly purpose: 'admin-access';
  readonly iat?: number;
  readonly exp?: number;
}

export function getIsSecureRequest(request: Request): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    request.secure ||
    request.headers?.['x-forwarded-proto'] === 'https'
  );
}

function getIsCrossOriginRequest(request: Request): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) {
    return false;
  }
  try {
    const forwardedProto = request.headers?.['x-forwarded-proto'];
    const protocol = request.secure || forwardedProto === 'https' ? 'https' : 'http';
    const requestOrigin = `${protocol}://${host}`;
    return new URL(origin).origin !== requestOrigin;
  } catch {
    return false;
  }
}

function getSameSiteForRequest(request: Request): CookieOptions['sameSite'] {
  const isSecure = getIsSecureRequest(request);
  const shouldUseCrossSiteCookies =
    process.env.NODE_ENV === 'production' || getIsCrossOriginRequest(request);
  if (shouldUseCrossSiteCookies && isSecure) {
    return 'none';
  }
  return 'lax';
}

export function getSessionCookieBaseOptions(
  request: Request,
): Pick<CookieOptions, 'httpOnly' | 'secure' | 'sameSite' | 'path' | 'partitioned'> {
  const isSecure = getIsSecureRequest(request);
  const isCrossOrigin = getIsCrossOriginRequest(request);
  const shouldUsePartitionedCookies = isSecure && isCrossOrigin;
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: getSameSiteForRequest(request),
    path: '/',
    partitioned: shouldUsePartitionedCookies,
  };
}

export function getSessionCookieOptions(
  request: Request,
  maxAge: number,
): Pick<CookieOptions, 'httpOnly' | 'secure' | 'sameSite' | 'path' | 'partitioned' | 'maxAge'> {
  return {
    ...getSessionCookieBaseOptions(request),
    maxAge,
  };
}

export function getWhitelistEmails(): string[] {
  return (process.env.WHITE_LIST_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isWhitelistedAdminEmail(email: string): boolean {
  return getWhitelistEmails().includes(email.trim().toLowerCase());
}

export function isAdminRoutePasswordValid(password: string): boolean {
  const expected = process.env.PASSWORD_PROTECTED_ROUTES;
  if (!expected) return false;
  if (password.length !== expected.length) return false;
  return timingSafeEqual(
    new Uint8Array(Buffer.from(password)),
    new Uint8Array(Buffer.from(expected)),
  );
}

export function signAdminAccessToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'admin-access' }, getJwtSecret(), {
    expiresIn: Math.floor(ADMIN_ACCESS_DURATION_MS / 1000),
  });
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AdminAccessTokenPayload;
    if (payload.purpose !== 'admin-access') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getAdminAccessCookieOptions(request: Request): CookieOptions {
  return getSessionCookieOptions(request, ADMIN_ACCESS_DURATION_MS);
}

export function setAdminAccessCookie(response: Response, request: Request, userId: string): void {
  const token = signAdminAccessToken(userId);
  response.cookie(ADMIN_ACCESS_COOKIE_NAME, token, getAdminAccessCookieOptions(request));
}

export function clearAdminAccessCookie(response: Response, request: Request): void {
  response.clearCookie(ADMIN_ACCESS_COOKIE_NAME, getSessionCookieBaseOptions(request));
}
