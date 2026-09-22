import { AppError } from '../../../domain/errors/AppError';
import {
  ISalesInvoiceRepository,
  SalesInvoiceWithItems,
} from '../../../domain/repositories/ISalesInvoiceRepository';

/** Marks a sales invoice as paid (sets `paidAt`), so it drops out of the overdue view. */
export class MarkInvoicePaidUseCase {
  constructor(private readonly salesInvoiceRepository: ISalesInvoiceRepository) {}

  async execute(invoiceId: string): Promise<SalesInvoiceWithItems> {
    const existing = await this.salesInvoiceRepository.findById(invoiceId);
    if (!existing) {
      throw AppError.notFound('Fattura non trovata', 'INVOICE_NOT_FOUND');
    }
    if (existing.salesInvoice.paidAt) {
      return existing;
    }
    return this.salesInvoiceRepository.markPaid(invoiceId, new Date());
  }
}
