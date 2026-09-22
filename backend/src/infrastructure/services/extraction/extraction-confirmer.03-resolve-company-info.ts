import { AppError } from '../../../domain/errors/AppError';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export async function extractionConfirmerResolveCompanyInfo(this: ExtractionConfirmerContext, companyId: string): Promise<{ name: string; vatNumber: string }> {
    const company = await this.companyRepository.findById(companyId);
    if (!company) {
      throw AppError.notFound('Company not found for extraction', 'COMPANY_NOT_FOUND');
    }
    return { name: company.name, vatNumber: company.vatNumber };
  }
