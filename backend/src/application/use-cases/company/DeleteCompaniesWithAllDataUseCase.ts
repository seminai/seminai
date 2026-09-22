import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';

export interface DeleteCompaniesWithAllDataInput {
  readonly companyIds: readonly string[];
}

export interface DeleteCompaniesWithAllDataResult {
  readonly deletedCount: number;
}

/**
 * Deletes one or more companies with every dependent record.
 */
export class DeleteCompaniesWithAllDataUseCase {
  constructor(private readonly companyRepository: ICompanyRepository) {}

  async execute(input: DeleteCompaniesWithAllDataInput): Promise<DeleteCompaniesWithAllDataResult> {
    let deletedCount = 0;
    for (const companyId of input.companyIds) {
      const existing = await this.companyRepository.findById(companyId);
      if (!existing) continue;
      await this.companyRepository.deleteWithAllData(companyId);
      deletedCount++;
    }
    return { deletedCount };
  }
}
