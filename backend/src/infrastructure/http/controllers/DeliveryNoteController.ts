import { Request, Response } from 'express';
import { DeliveryNoteStatus } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { IDeliveryNoteRepository } from '../../../domain/repositories/IDeliveryNoteRepository';
import { GetDeliveryNoteUseCase } from '../../../application/use-cases/delivery-note/GetDeliveryNoteUseCase';
import { CancelDeliveryNoteUseCase } from '../../../application/use-cases/delivery-note/CancelDeliveryNoteUseCase';
import { MarkSentDeliveryNoteUseCase } from '../../../application/use-cases/delivery-note/MarkSentDeliveryNoteUseCase';
import { GetShippingSummaryUseCase } from '../../../application/use-cases/delivery-note/GetShippingSummaryUseCase';
import { SendCourierSummaryEmailUseCase } from '../../../application/use-cases/delivery-note/SendCourierSummaryEmailUseCase';
import { renderDeliveryNoteHtml } from '../../../application/use-cases/delivery-note/render-ddt-html';

function parseStatus(value: unknown): DeliveryNoteStatus | undefined {
  const statuses = Object.values(DeliveryNoteStatus) as string[];
  return typeof value === 'string' && statuses.includes(value)
    ? (value as DeliveryNoteStatus)
    : undefined;
}

/** REST controller for DDTs (read, cancel, printable HTML, list). */
export class DeliveryNoteController {
  constructor(
    private readonly getUseCase: GetDeliveryNoteUseCase,
    private readonly cancelUseCase: CancelDeliveryNoteUseCase,
    private readonly markSentUseCase: MarkSentDeliveryNoteUseCase,
    private readonly getShippingSummaryUseCase: GetShippingSummaryUseCase,
    private readonly sendCourierSummaryUseCase: SendCourierSummaryEmailUseCase,
    private readonly deliveryNoteRepository: IDeliveryNoteRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
  ) {}

  async getShippingSummary(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.query.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const summary = await this.getShippingSummaryUseCase.execute(companyId);
    return response.json({ status: 'success', data: { summary } });
  }

  async sendCourierSummary(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.body?.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const result = await this.sendCourierSummaryUseCase.execute(companyId);
    return response.json({ status: 'success', data: result });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const result = await this.getUseCase.execute(request.params.id);
    await this.assertCompanyAccess(result.deliveryNote.companyId, userId);
    return response.json({
      status: 'success',
      data: { deliveryNote: result.deliveryNote, items: result.items },
    });
  }

  async cancel(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const existing = await this.getUseCase.execute(id);
    await this.assertCompanyAccess(existing.deliveryNote.companyId, userId);
    const result = await this.cancelUseCase.execute({
      deliveryNoteId: id,
      reason: request.body?.reason,
    });
    return response.json({
      status: 'success',
      data: { deliveryNote: result.deliveryNote, items: result.items },
    });
  }

  async markSent(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const existing = await this.getUseCase.execute(id);
    await this.assertCompanyAccess(existing.deliveryNote.companyId, userId);
    const result = await this.markSentUseCase.execute(id);
    return response.json({
      status: 'success',
      data: { deliveryNote: result.deliveryNote, items: result.items },
    });
  }

  async list(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const companyId = request.query.companyId as string | undefined;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    await this.assertCompanyAccess(companyId, userId);
    const deliveryNotes = await this.deliveryNoteRepository.findManyByCompany(companyId, {
      status: parseStatus(request.query.status),
    });
    return response.json({ status: 'success', data: { deliveryNotes } });
  }

  async print(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const result = await this.getUseCase.execute(request.params.id);
    await this.assertCompanyAccess(result.deliveryNote.companyId, userId);
    const company = await this.companyRepository.findById(result.deliveryNote.companyId);
    const html = renderDeliveryNoteHtml({
      deliveryNote: result.deliveryNote,
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
