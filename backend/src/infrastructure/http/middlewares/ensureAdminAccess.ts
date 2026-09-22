import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import {
  ADMIN_ACCESS_COOKIE_NAME,
  isWhitelistedAdminEmail,
  verifyAdminAccessToken,
} from '../utils/admin-access';

async function findAuthenticatedAdminUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      isBlocked: true,
      isDeactivated: true,
    },
  });
}

async function validateAdminIdentity(request: Request) {
  if (!request.user?.id) {
    throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
  }
  const user = await findAuthenticatedAdminUser(request.user.id);
  if (!user) {
    throw AppError.unauthorized('User not found', 'USER_NOT_FOUND');
  }
  if (user.isDeactivated) {
    throw AppError.unauthorized('User is deactivated', 'USER_DEACTIVATED');
  }
  if (user.isBlocked) {
    throw AppError.unauthorized('User is blocked', 'USER_BLOCKED');
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.GOD) {
    throw AppError.forbidden('Admin role required', 'ADMIN_ROLE_REQUIRED');
  }
  if (!isWhitelistedAdminEmail(user.email)) {
    throw AppError.forbidden('Email is not allowed for admin routes', 'ADMIN_EMAIL_NOT_ALLOWED');
  }
  return user;
}

function handleAdminError(error: unknown, response: Response): void {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      status: 'error',
      message: error.message,
      code: error.code,
    });
    return;
  }
  console.error('Admin access middleware error:', error);
  response.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
}

export async function ensureAdminWhitelist(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await validateAdminIdentity(request);
    next();
  } catch (error) {
    handleAdminError(error, response);
  }
}

export async function ensureAdminAccess(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await validateAdminIdentity(request);
    const adminAccessToken = request.cookies?.[ADMIN_ACCESS_COOKIE_NAME];
    if (typeof adminAccessToken !== 'string' || !adminAccessToken.trim()) {
      throw AppError.forbidden('Admin password confirmation required', 'ADMIN_UNLOCK_REQUIRED');
    }
    const payload = verifyAdminAccessToken(adminAccessToken);
    if (!payload || payload.userId !== user.id) {
      throw AppError.forbidden('Admin access confirmation expired', 'ADMIN_UNLOCK_EXPIRED');
    }
    next();
  } catch (error) {
    handleAdminError(error, response);
  }
}
