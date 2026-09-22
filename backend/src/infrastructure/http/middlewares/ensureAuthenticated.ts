import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../../repositories/Prisma';
import { getJwtSecret } from '../../../utils/get-jwt-secret';
import { getRedisConnection } from '../../queue/redis.connection';

const LAST_ACCESS_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const USER_CACHE_TTL_SEC = 300; // 5 minutes
const USER_CACHE_PREFIX = 'user:profile:';

interface TokenPayload {
  userId: string;
  iat: number;
  exp: number;
}

interface CachedUserProfile {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
  readonly lastAccessAt: string | null;
  readonly isBlocked: boolean;
  readonly isDeactivated: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email?: string;
      name?: string;
      role?: UserRole;
    };
  }
}

async function getCachedUser(userId: string): Promise<CachedUserProfile | null> {
  try {
    const redis = getRedisConnection();
    const cached = await redis.get(`${USER_CACHE_PREFIX}${userId}`);
    if (!cached) return null;
    return JSON.parse(cached) as CachedUserProfile;
  } catch {
    return null;
  }
}

async function setCachedUser(userId: string, profile: CachedUserProfile): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.setex(`${USER_CACHE_PREFIX}${userId}`, USER_CACHE_TTL_SEC, JSON.stringify(profile));
  } catch {
    // Redis down — skip caching silently
  }
}

export async function ensureAuthenticated(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = ((): string | null => {
      const authHeader = request.headers.authorization;
      if (authHeader) {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && /^Bearer$/i.test(parts[0]) && parts[1]) {
          return parts[1];
        }
      }
      const xAccess = (request.headers['x-access-token'] as string | undefined)?.trim();
      if (xAccess) return xAccess;
      const cookieHeader = request.headers.cookie || '';
      if (cookieHeader) {
        const authCookieName = 'auth_token';
        const cookieToken = cookieHeader.split(';').reduce<string | null>((found, pair) => {
          if (found !== null) return found;
          const [rawKey, ...rest] = pair.split('=');
          if (!rawKey) return null;
          const key = rawKey.trim();
          if (key !== authCookieName) return null;
          const value = rest.join('=').trim();
          if (!value) return null;
          try {
            return decodeURIComponent(value);
          } catch (error) {
            console.warn(`Failed to decode cookie '${key}', using raw value`, error.message);
            return value;
          }
        }, null);
        if (cookieToken !== null) {
          return cookieToken.replace(/^"|"$/g, '');
        }
      }
      return null;
    })();

    if (!token) {
      response.status(401).json({ message: 'JWT token is missing' });
      return;
    }

    try {
      const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
      // Try Redis cache first, fall back to DB
      let userProfile = await getCachedUser(decoded.userId);
      if (!userProfile) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            lastAccessAt: true,
            isBlocked: true,
            isDeactivated: true,
          },
        });
        if (!user) {
          response.status(401).json({ message: 'User not found' });
          return;
        }
        userProfile = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          lastAccessAt: user.lastAccessAt?.toISOString() ?? null,
          isBlocked: user.isBlocked,
          isDeactivated: user.isDeactivated,
        };
        await setCachedUser(decoded.userId, userProfile);
      }
      if (userProfile.isDeactivated) {
        response.status(401).json({ message: 'User is deactivated', code: 'USER_DEACTIVATED' });
        return;
      }
      if (userProfile.isBlocked) {
        response.status(401).json({ message: 'User is blocked', code: 'USER_BLOCKED' });
        return;
      }
      const lastAccessAt = userProfile.lastAccessAt ? new Date(userProfile.lastAccessAt) : null;
      const shouldUpdateLastAccess =
        !lastAccessAt || Date.now() - lastAccessAt.getTime() > LAST_ACCESS_UPDATE_INTERVAL_MS;
      if (shouldUpdateLastAccess) {
        await prisma.user.update({
          where: { id: userProfile.id },
          data: { lastAccessAt: new Date() },
        });
      }
      request.user = {
        id: userProfile.id,
        email: userProfile.email,
        name: userProfile.name,
        role: userProfile.role,
      };
      return next();
    } catch (error) {
      response.status(401).json({ message: 'Invalid JWT token' });
    }
  } catch (error) {
    response.status(500).json({ message: 'Internal server error' });
  }
}
