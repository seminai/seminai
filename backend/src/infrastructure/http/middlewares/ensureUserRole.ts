import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';

/**
 * Middleware per verificare che l'utente autenticato abbia uno dei ruoli utente specificati
 * @param allowedRoles - Array di ruoli permessi (ADMIN, BASIC, LABEL_MANAGER)
 */
export function ensureUserRole(allowedRoles: readonly UserRole[]) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.user) {
        throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
      }

      const userId = request.user.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (!user) {
        throw AppError.unauthorized('User not found', 'USER_NOT_FOUND');
      }

      if (!allowedRoles.includes(user.role)) {
        throw AppError.forbidden(
          `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`,
          'INSUFFICIENT_PERMISSIONS',
        );
      }

      next();
    } catch (error) {
      if (error instanceof AppError) {
        response.status(error.statusCode).json({
          status: 'error',
          message: error.message,
          code: error.code,
        });
      } else {
        console.error('Middleware error:', error);
        response.status(500).json({
          status: 'error',
          message: 'Internal server error',
        });
      }
    }
  };
}
