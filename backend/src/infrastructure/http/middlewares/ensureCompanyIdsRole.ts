import { Request, Response, NextFunction } from 'express';
import { CompanyRole } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';

export function ensureCompanyIdsRole(allowedRoles: CompanyRole[], bodyKey: string = 'companyIds') {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.user) throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
      const companyIds = readCompanyIds(request.body?.[bodyKey]);
      if (companyIds.length === 0) {
        throw AppError.badRequest('Company IDs not provided', 'MISSING_COMPANY_ID');
      }
      const memberships = await prisma.userOnCompany.findMany({
        where: { userId: request.user.id, companyId: { in: companyIds } },
        select: { companyId: true, role: true },
      });
      const allowedByCompany = new Map(memberships.map((item) => [item.companyId, item.role]));
      const missing = companyIds.find((companyId) => !allowedByCompany.has(companyId));
      if (missing)
        throw AppError.forbidden('User is not a member of this company', 'NOT_COMPANY_MEMBER');
      const forbidden = companyIds.find((companyId) => {
        const role = allowedByCompany.get(companyId);
        return !role || !allowedRoles.includes(role);
      });
      if (forbidden)
        throw AppError.forbidden('Insufficient permissions', 'INSUFFICIENT_PERMISSIONS');
      next();
    } catch (error) {
      handleRoleError(response, error);
    }
  };
}

function readCompanyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function handleRoleError(response: Response, error: unknown): void {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      status: 'error',
      message: error.message,
      code: error.code,
    });
    return;
  }
  console.error('Middleware error:', error);
  response.status(500).json({ status: 'error', message: 'Internal server error' });
}
