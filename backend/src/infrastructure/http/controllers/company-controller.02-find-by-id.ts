import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerFindById(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params;

    const company = await this.companyRepository.findById(id);

    if (!company) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }

    return response.json({
      status: 'success',
      data: { company },
    });
  }
