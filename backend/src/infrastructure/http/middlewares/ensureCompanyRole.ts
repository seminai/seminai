import { Request, Response, NextFunction } from 'express';
import { CompanyRole } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';

/**
 * Middleware per verificare che l'utente autenticato abbia un determinato ruolo nell'azienda
 * @param allowedRoles - Array di ruoli permessi (ADMIN, EDITOR, VIEWER)
 * @param companyIdParam - Nome del parametro che contiene il companyId (default: 'companyId')
 */
export function ensureCompanyRole(
  allowedRoles: CompanyRole[],
  companyIdParam: string = 'companyId',
) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.user) {
        throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
      }

      const userId = request.user.id;

      // 1. Try to find companyId in route params (e.g. /companies/:companyId/...)
      let companyId = request.params[companyIdParam];

      // 2. If not in params, try query string (e.g. ?companyId=...)
      if (!companyId && request.query[companyIdParam]) {
        companyId = request.query[companyIdParam] as string;
      }

      // 3. If not in query, try body (e.g. JSON body or form-data parsed before this)
      // Note: For multipart/form-data, body might not be populated if multer hasn't run yet
      if (!companyId && request.body?.companyId) {
        companyId = request.body.companyId;
      }

      // 4. If not found directly in body, try to extract from nested arrays (e.g. machines[0].companyId)
      if (!companyId && request.body) {
        const commonArrayKeys = ['machines', 'companies', 'fields', 'products', 'productionUnits'];
        for (const arrayKey of commonArrayKeys) {
          if (
            Array.isArray(request.body[arrayKey]) &&
            request.body[arrayKey].length > 0 &&
            request.body[arrayKey][0]?.[companyIdParam]
          ) {
            companyId = request.body[arrayKey][0][companyIdParam];
            break;
          }
        }
      }

      if (!companyId) {
        throw AppError.badRequest('Company ID not provided', 'MISSING_COMPANY_ID');
      }

      const userOnCompany = await prisma.userOnCompany.findFirst({
        where: {
          userId,
          companyId,
        },
      });

      if (!userOnCompany) {
        throw AppError.forbidden('User is not a member of this company', 'NOT_COMPANY_MEMBER');
      }

      if (!allowedRoles.includes(userOnCompany.role)) {
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
