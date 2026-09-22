import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { GetProformaUseCase } from '../../../application/use-cases/proforma/GetProformaUseCase';
import { renderProformaHtml } from '../../../application/use-cases/proforma/render-proforma-html';

/** REST controller for proforma invoices (read + printable HTML). */
export class ProformaController {
  constructor(
    private readonly getUseCase: GetProformaUseCase,
    private readonly companyRepository: ICompanyRepository,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
  ) {}

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const result = await this.getUseCase.execute(request.params.id);
    await this.assertCompanyAccess(result.proformaInvoice.companyId, userId);
    return response.json({
      status: 'success',
      data: { proformaInvoice: result.proformaInvoice, items: result.items },
    });
  }

  async print(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const result = await this.getUseCase.execute(request.params.id);
    await this.assertCompanyAccess(result.proformaInvoice.companyId, userId);
    const company = await this.companyRepository.findById(result.proformaInvoice.companyId);
    const html = renderProformaHtml({
      proformaInvoice: result.proformaInvoice,
      items: result.items,
      seller: company
        ? {
            name: company.name,
            vatNumber: company.vatNumber,
            fiscalCode: company.fiscalCode,
            address: company.address,
            city: company.city,
            cap: company.cap,
            nation: company.nation,
          }
        : undefined,
    });
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return response.send(html);
  }

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
  }

  private async assertCompanyAccess(companyId: string, userId: string): Promise<void> {
    const membership = await this.userOnCompanyRepository.findByCompanyAndUser(companyId, userId);
    if (!membership) {
      throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
    }
  }
}
