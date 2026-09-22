import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerUpdate(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const updateData = request.body;

    const existingCompany = await this.companyRepository.findById(id);
    if (!existingCompany) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }

    if (updateData.vatNumber && updateData.vatNumber !== existingCompany.vatNumber) {
      const existingByVat = await this.companyRepository.findByVatNumber(updateData.vatNumber);
      if (existingByVat) {
        throw AppError.conflict('Company with this VAT number already exists', 'COMPANY_EXISTS');
      }
    }

    if (updateData.fiscalCode && updateData.fiscalCode !== existingCompany.fiscalCode) {
      const existingByFiscalCode = await this.companyRepository.findByFiscalCode(
        updateData.fiscalCode,
      );
      if (existingByFiscalCode) {
        throw AppError.conflict('Company with this fiscal code already exists', 'COMPANY_EXISTS');
      }
    }

    if (updateData.kind && updateData.kind !== existingCompany.kind) {
      await this.assertCompanyKindChangeAllowed(id, updateData.kind);
    }

    const updatedCompany = await this.companyRepository.update(id, updateData);

    return response.json({
      status: 'success',
      data: { company: updatedCompany },
    });
  }
