import { AppError } from '../../../domain/errors/AppError';
import { ISalesInvoiceRepository } from '../../../domain/repositories/ISalesInvoiceRepository';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { EmailSender } from '../delivery-note/SendCourierSummaryEmailUseCase';
import { buildPaymentReminderEmail } from '../../../infrastructure/services/email-templates/payment-reminder.template';

export interface PaymentReminderResult {
  readonly sent: boolean;
  readonly companyId: string;
}

/**
 * Emails the customer a payment reminder for an overdue invoice and stamps
 * `lastReminderAt`. Requires the partner to have an email (else `PARTNER_NO_EMAIL`).
 */
export class SendPaymentReminderEmailUseCase {
  constructor(
    private readonly salesInvoiceRepository: ISalesInvoiceRepository,
    private readonly businessPartnerRepository: IBusinessPartnerRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly emailSender: EmailSender,
  ) {}

  async execute(invoiceId: string): Promise<PaymentReminderResult> {
    const entry = await this.salesInvoiceRepository.findById(invoiceId);
    if (!entry) {
      throw AppError.notFound('Fattura non trovata', 'INVOICE_NOT_FOUND');
    }
    const invoice = entry.salesInvoice;
    const partner = await this.businessPartnerRepository.findById(invoice.partnerId);
    if (!partner?.email) {
      throw AppError.badRequest('Il cliente non ha un indirizzo email', 'PARTNER_NO_EMAIL');
    }
    const company = await this.companyRepository.findById(invoice.companyId);
    const email = buildPaymentReminderEmail({
      companyName: company?.name ?? 'La tua azienda',
      partnerName: partner.name,
      invoiceNumber: invoice.label,
      dueDate: invoice.dueDate,
      amount: invoice.totalAmount,
    });
    await this.emailSender.sendRawEmail({
      to: partner.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    await this.salesInvoiceRepository.markReminderSent(invoiceId, new Date());
    return { sent: true, companyId: invoice.companyId };
  }
}
