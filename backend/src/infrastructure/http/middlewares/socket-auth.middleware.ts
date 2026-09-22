import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../../repositories/Prisma';

/**
 * Extended Socket interface with user data
 */
export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

/**
 * JWT payload structure
 */
interface JWTPayload {
  readonly userId: string;
  readonly email?: string;
  readonly iat?: number;
  readonly exp?: number;
}

/**
 * Socket.IO authentication middleware
 * Verifies JWT token and attaches user info to socket
 */
export const socketAuthMiddleware = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void,
): Promise<void> => {
  try {
    const token = ((): string | null => {
      // 1. Check auth.token (from socket.io client auth option)
      if (socket.handshake.auth.token) {
        const authToken = socket.handshake.auth.token;
        return typeof authToken === 'string' ? authToken.replace('Bearer ', '') : authToken;
      }

      // 2. Check Authorization header
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader) {
        if (typeof authHeader === 'string') {
          const parts = authHeader.split(' ');
          if (parts.length === 2 && /^Bearer$/i.test(parts[0]) && parts[1]) {
            return parts[1];
          }
        }
      }

      // 3. Check cookie (httpOnly cookie set by backend)
      const cookieHeader = socket.handshake.headers.cookie || '';
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
            console.warn(`[SOCKET-AUTH] Failed to decode cookie '${key}', using raw value`);
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
      console.error(`[SOCKET-AUTH] No token provided for socket ${socket.id}`);
      return next(new Error('Authentication token required'));
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('[SOCKET-AUTH] JWT_SECRET not configured');
      return next(new Error('Server configuration error'));
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    if (!decoded.userId) {
      console.error(`[SOCKET-AUTH] Invalid JWT payload for socket ${socket.id}:`, decoded);
      return next(new Error('Invalid token payload'));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        isBlocked: true,
        isDeactivated: true,
      },
    });

    if (!user || user.isBlocked || user.isDeactivated) {
      return next(new Error('User is not allowed to connect'));
    }

    socket.userId = user.id;
    socket.userEmail = user.email;

    console.log(`[SOCKET-AUTH] User ${user.id} authenticated`);
    next();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SOCKET-AUTH] Authentication failed for socket ${socket.id}:`, errorMessage);
    next(new Error('Invalid authentication token'));
  }
};
