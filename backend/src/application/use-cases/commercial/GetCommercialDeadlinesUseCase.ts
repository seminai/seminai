import { DeliveryNoteStatus, EmailIngestionStatus, SalesOrderStatus } from '@prisma/client';
import {
  type ISalesOrderRepository,
  type SalesOrderWithItems,
} from '../../../domain/repositories/ISalesOrderRepository';
import { type IDeliveryNoteRepository } from '../../../domain/repositories/IDeliveryNoteRepository';
import { type IEmailIngestionRepository } from '../../../domain/repositories/IEmailIngestionRepository';
import { type IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { type ISalesInvoiceRepository } from '../../../domain/repositories/ISalesInvoiceRepository';
import { type CommercialDeadlinesDto } from '../../../domain/dtos/commercial.dto';

const FOLLOW_UP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isToProcess(entry: SalesOrderWithItems): boolean {
  return (
    entry.order.status === SalesOrderStatus.DRAFT ||
    entry.order.status === SalesOrderStatus.CONFIRMED
  );
}

export interface GetCommercialDeadlinesParams {
  readonly companyId: string;
  readonly now?: Date;
}

/**
 * Computes the home dashboard widget counts (orders to process, outgoing DDT,
 * overdue invoices, pending emails, follow-ups sent) for a company. Read-only.
 */
export class GetCommercialDeadlinesUseCase {
  constructor(
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly deliveryNoteRepository: IDeliveryNoteRepository,
    private readonly emailIngestionRepository: IEmailIngestionRepository,
    private readonly businessPartnerRepository: IBusinessPartnerRepository,
    private readonly salesInvoiceRepository: ISalesInvoiceRepository,
  ) {}

  async execute(params: GetCommercialDeadlinesParams): Promise<CommercialDeadlinesDto> {
    const now = params.now ?? new Date();
    const since = now.getTime() - FOLLOW_UP_WINDOW_MS;
    const [orders, ddts, emails, partners, overdue] = await Promise.all([
      this.salesOrderRepository.findManyByCompany(params.companyId),
      this.deliveryNoteRepository.findManyByCompany(params.companyId, {
        status: DeliveryNoteStatus.GENERATED,
      }),
      this.emailIngestionRepository.findManyByCompany({
        companyId: params.companyId,
        statuses: [EmailIngestionStatus.AWAITING_DISAMBIGUATION],
      }),
      this.businessPartnerRepository.findManyByCompany(params.companyId),
      this.salesInvoiceRepository.findOverdueByCompany(params.companyId, now),
    ]);
    const followUpsSent = partners.filter(
      (partner) => partner.followUpLastSentAt && partner.followUpLastSentAt.getTime() >= since,
    ).length;
    return {
      ordersToProcess: orders.filter(isToProcess).length,
      outgoingDdt: ddts.length,
      overdueInvoices: overdue.length,
      pendingEmails: emails.length,
      followUpsSent,
    };
  }
}
