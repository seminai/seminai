import { DeliveryNoteStatus, EmailIngestionStatus } from '@prisma/client';
import type { ISalesOrderRepository } from '../../../domain/repositories/ISalesOrderRepository';
import type { IDeliveryNoteRepository } from '../../../domain/repositories/IDeliveryNoteRepository';
import type { IEmailIngestionRepository } from '../../../domain/repositories/IEmailIngestionRepository';
import type { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import type { IProformaInvoiceRepository } from '../../../domain/repositories/IProformaInvoiceRepository';
import type { ISalesInvoiceRepository } from '../../../domain/repositories/ISalesInvoiceRepository';
import type { CommercialInboxResponse } from '../../../domain/dtos/commercial.dto';
import {
  buildCourierSummaryItem,
  compareItems,
  DISPATCHED_WINDOW_MS,
  isItem,
  mapDeliveryNote,
  mapEmail,
  mapOrder,
  mapOverdueInvoice,
} from './commercial-inbox-items';

export interface GetCommercialInboxParams {
  readonly companyId: string;
  readonly now?: Date;
}

export class GetCommercialInboxUseCase {
  constructor(
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly deliveryNoteRepository: IDeliveryNoteRepository,
    private readonly emailIngestionRepository: IEmailIngestionRepository,
    private readonly businessPartnerRepository: IBusinessPartnerRepository,
    private readonly proformaInvoiceRepository: IProformaInvoiceRepository,
    private readonly salesInvoiceRepository: ISalesInvoiceRepository,
  ) {}

  async execute(params: GetCommercialInboxParams): Promise<CommercialInboxResponse> {
    const now = params.now ?? new Date();
    const since = new Date(now.getTime() - DISPATCHED_WINDOW_MS);
    const [orders, ddts, awaitingEmails, dispatchedEmails, partners, proformaOrderIds, overdue] =
      await Promise.all([
        this.salesOrderRepository.findManyByCompany(params.companyId),
        this.deliveryNoteRepository.findManyByCompany(params.companyId, {
          status: DeliveryNoteStatus.GENERATED,
        }),
        this.emailIngestionRepository.findManyByCompany({
          companyId: params.companyId,
          statuses: [EmailIngestionStatus.AWAITING_DISAMBIGUATION],
        }),
        this.emailIngestionRepository.findManyByCompany({
          companyId: params.companyId,
          statuses: [EmailIngestionStatus.DISPATCHED],
          since,
        }),
        this.businessPartnerRepository.findManyByCompany(params.companyId),
        this.proformaInvoiceRepository.findOrderIdsByCompany(params.companyId),
        this.salesInvoiceRepository.findOverdueByCompany(params.companyId, now),
      ]);
    const partnerNames = new Map(partners.map((partner) => [partner.id, partner.name]));
    const proformaSet = new Set(proformaOrderIds);
    const courierSummary = buildCourierSummaryItem(ddts, params.companyId, now);
    const items = [
      ...(courierSummary ? [courierSummary] : []),
      ...overdue.map((invoice) => mapOverdueInvoice(invoice, now)),
      ...ddts.map((ddt) => mapDeliveryNote(ddt, now)),
      ...orders.map((order) => mapOrder(order, partnerNames, proformaSet, now)).filter(isItem),
      ...awaitingEmails.map((email) => mapEmail(email, 'REVIEW_ATTACHMENT', params.companyId, now)),
      ...dispatchedEmails.map((email) => mapEmail(email, 'OPEN_CHAT', params.companyId, now)),
    ].sort(compareItems);
    return { items };
  }
}
