import { Request, Response } from 'express';
import { DeleteCompaniesWithAllDataUseCase } from '../../../application/use-cases/company/DeleteCompaniesWithAllDataUseCase';
import { AppError } from '../../../domain/errors/AppError';

export class CompanyDeletionController {
  constructor(private readonly deleteCompaniesUseCase: DeleteCompaniesWithAllDataUseCase) {}

  /**
   * Deletes one company with all related data.
   */
  async deleteOne(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const result = await this.deleteCompaniesUseCase.execute({ companyIds: [id] });
    if (result.deletedCount === 0) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }
    return response.status(204).send();
  }

  /**
   * Deletes multiple companies with all related data.
   */
  async deleteBulk(request: Request, response: Response): Promise<Response> {
    const { companyIds } = request.body as { companyIds?: string[] };
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      throw AppError.badRequest('Missing companyIds array', 'MISSING_FIELDS');
    }
    const result = await this.deleteCompaniesUseCase.execute({ companyIds });
    return response.json({ status: 'success', data: result });
  }
}
