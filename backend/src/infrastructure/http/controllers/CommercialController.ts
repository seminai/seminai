import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { GetCommercialInboxUseCase } from '../../../application/use-cases/commercial/GetCommercialInboxUseCase';
import { GetCommercialDeadlinesUseCase } from '../../../application/use-cases/commercial/GetCommercialDeadlinesUseCase';

/** REST controller for the commercial "what to do today" surface + commercial settings. */
export class CommercialController {
  constructor(
    private readonly getInboxUseCase: GetCommercialInboxUseCase,
    private readonly getDeadlinesUseCase: GetCommercialDeadlinesUseCase,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async getCourierEmail(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = this.requireCompanyId(request);
    await this.assertCompanyAccess(companyId, userId);
    const courierEmail = await this.companyRepository.getCourierEmail(companyId);
    return response.json({ status: 'success', data: { courierEmail } });
  }

  async updateCourierEmail(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.body?.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const raw = (request.body?.courierEmail as string | undefined)?.trim() ?? '';
    await this.companyRepository.setCourierEmail(companyId, raw.length > 0 ? raw : null);
    return response.json({
      status: 'success',
      data: { courierEmail: raw.length > 0 ? raw : null },
    });
  }

  async getInbox(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = this.requireCompanyId(request);
    await this.assertCompanyAccess(companyId, userId);
    const result = await this.getInboxUseCase.execute({ companyId });
    return response.json({ status: 'success', data: { items: result.items } });
  }

  async getDeadlines(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = this.requireCompanyId(request);
    await this.assertCompanyAccess(companyId, userId);
    const deadlines = await this.getDeadlinesUseCase.execute({ companyId });
    return response.json({ status: 'success', data: { deadlines } });
  }

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
  }

  private requireCompanyId(request: Request): string {
    const companyId = request.query.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    return companyId;
  }

  private async assertCompanyAccess(companyId: string, userId: string): Promise<void> {
    const membership = await this.userOnCompanyRepository.findByCompanyAndUser(companyId, userId);
    if (!membership) {
      throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
    }
  }
}
