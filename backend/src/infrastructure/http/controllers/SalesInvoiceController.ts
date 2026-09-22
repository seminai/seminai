import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ISalesInvoiceRepository } from '../../../domain/repositories/ISalesInvoiceRepository';
import { toSalesInvoiceSummary } from '../../../domain/dtos/sales-invoice.dto';
import { SendPaymentReminderEmailUseCase } from '../../../application/use-cases/sales-invoice/SendPaymentReminderEmailUseCase';
import { MarkInvoicePaidUseCase } from '../../../application/use-cases/sales-invoice/MarkInvoicePaidUseCase';

/** REST controller for sales invoices (list, send reminder, mark paid). */
export class SalesInvoiceController {
  constructor(
    private readonly sendReminderUseCase: SendPaymentReminderEmailUseCase,
    private readonly markPaidUseCase: MarkInvoicePaidUseCase,
    private readonly salesInvoiceRepository: ISalesInvoiceRepository,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
  ) {}

  async list(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.query.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const now = new Date();
    const overdueOnly = request.query.overdue === 'true';
    const entries = await this.salesInvoiceRepository.findManyByCompany(companyId, {
      overdueOnly,
      now,
    });
    return response.json({
      status: 'success',
      data: { invoices: entries.map((entry) => toSalesInvoiceSummary(entry, now)) },
    });
  }

  async sendReminder(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = await this.assertInvoiceAccess(request.params.id, userId);
    const result = await this.sendReminderUseCase.execute(request.params.id);
    return response.json({ status: 'success', data: { ...result, companyId } });
  }

  async markPaid(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    await this.assertInvoiceAccess(request.params.id, userId);
    const result = await this.markPaidUseCase.execute(request.params.id);
    return response.json({
      status: 'success',
      data: { invoice: toSalesInvoiceSummary(result, new Date()) },
    });
  }

  private async assertInvoiceAccess(invoiceId: string, userId: string): Promise<string> {
    const entry = await this.salesInvoiceRepository.findById(invoiceId);
    if (!entry) throw AppError.notFound('Fattura non trovata', 'INVOICE_NOT_FOUND');
    await this.assertCompanyAccess(entry.salesInvoice.companyId, userId);
    return entry.salesInvoice.companyId;
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
