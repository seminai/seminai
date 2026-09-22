import { Request, Response, NextFunction } from 'express';
import { CompanyRole } from '@prisma/client';
import { ensureCompanyIdsRole } from '../infrastructure/http/middlewares/ensureCompanyIdsRole';
import { prisma } from '../infrastructure/repositories/Prisma';

jest.mock('../infrastructure/repositories/Prisma', () => ({
  prisma: {
    userOnCompany: {
      findMany: jest.fn(),
    },
  },
}));

describe('ensureCompanyIdsRole', () => {
  it('rejects EDITOR users for company full delete routes', async () => {
    const findMany = prisma.userOnCompany.findMany as jest.Mock;
    findMany.mockResolvedValue([{ companyId: 'company-1', role: CompanyRole.EDITOR }]);
    const request = {
      user: { id: 'user-1' },
      body: { companyIds: ['company-1'] },
    } as unknown as Request;
    const response = createResponse();
    const next = jest.fn() as NextFunction;

    await ensureCompanyIdsRole([CompanyRole.ADMIN])(request, response, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INSUFFICIENT_PERMISSIONS' }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

function createResponse(): Response {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return response as unknown as Response;
}
