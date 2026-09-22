import { type CompanyExtractionCategorySummary } from '../../../domain/dtos/file-extraction.dto';
import { AppError } from '../../../domain/errors/AppError';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type IFileExtractionRepository } from '../../../domain/repositories/IFileExtractionRepository';

interface ListExtractionCategorySummaryInput {
  readonly userId: string;
  readonly companyId?: string;
}

export class ListExtractionCategorySummaryUseCase {
  constructor(
    private readonly extractionRepository: IFileExtractionRepository,
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute(
    input: ListExtractionCategorySummaryInput,
  ): Promise<readonly CompanyExtractionCategorySummary[]> {
    if (!input.userId) {
      throw AppError.badRequest('User identifier is required', 'USER_ID_REQUIRED');
    }
    const companies = await this.companyRepository.findManyByUserId(input.userId);
    const allowedCompanyIds = companies.map((company) => company.id);
    if (allowedCompanyIds.length === 0) {
      return [];
    }
    if (input.companyId && !allowedCompanyIds.includes(input.companyId)) {
      throw AppError.forbidden('Company is not accessible for this user', 'COMPANY_ACCESS_DENIED');
    }
    const targetCompanyIds = input.companyId ? [input.companyId] : allowedCompanyIds;
    return this.extractionRepository.findCategorySummaryByCompanyIds(targetCompanyIds);
  }
}
