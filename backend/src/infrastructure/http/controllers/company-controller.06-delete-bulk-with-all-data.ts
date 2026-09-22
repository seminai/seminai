import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerDeleteBulkWithAllData(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    const { companyIds } = request.body as { companyIds: string[] };

    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      throw AppError.badRequest('Missing companyIds array', 'MISSING_FIELDS');
    }

    let deletedCount = 0;
    for (const companyId of companyIds) {
      const existing = await this.companyRepository.findById(companyId);
      if (!existing) continue;
      await this.companyRepository.deleteWithAllData(companyId);
      deletedCount++;
    }

    return response.json({ status: 'success', data: { deletedCount } });
  }
