import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { Company } from '../../../domain/entities/Company';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerUpdateBulk(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { companies } = request.body as {
      companies: Array<{ id: string } & Partial<Company>>;
    };
    if (!Array.isArray(companies) || companies.length === 0) {
      throw AppError.badRequest('Missing companies array', 'MISSING_FIELDS');
    }
    const invalidIndex = companies.findIndex((c) => !c.id);
    if (invalidIndex !== -1) {
      throw AppError.badRequest(`Missing id in companies[${invalidIndex}]`, 'MISSING_COMPANY_ID');
    }

    for (const companyUpdate of companies) {
      if (!companyUpdate.kind) continue;
      const existingCompany = await this.companyRepository.findById(companyUpdate.id);
      if (!existingCompany || existingCompany.kind === companyUpdate.kind) continue;
      await this.assertCompanyKindChangeAllowed(companyUpdate.id, companyUpdate.kind);
    }

    const updates = companies.map((c) => {
      const { id, ...data } = c;
      return { id, data };
    });
    const count = await this.companyRepository.updateMany(updates);
    return response.json({ status: 'success', data: { count } });
  }
