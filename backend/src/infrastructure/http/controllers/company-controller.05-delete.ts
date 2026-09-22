import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerDelete(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params;

    const existingCompany = await this.companyRepository.findById(id);
    if (!existingCompany) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }

    await this.companyRepository.delete(id);

    return response.status(204).send();
  }
