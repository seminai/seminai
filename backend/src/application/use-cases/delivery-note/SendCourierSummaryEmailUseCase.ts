import { DeliveryNoteStatus } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { IDeliveryNoteRepository } from '../../../domain/repositories/IDeliveryNoteRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { aggregateShippingSummary } from './aggregate-shipping-summary';
import { renderCourierSummaryHtml } from './render-courier-summary-html';

/** Minimal email port (implemented by EmailService.sendRawEmail). */
export interface EmailSender {
  sendRawEmail(params: { to: string; subject: string; text: string; html?: string }): Promise<void>;
}

export interface CourierSummaryResult {
  readonly sent: number;
  readonly recipients: number;
  readonly courierEmail: string;
}

/**
 * Emails the courier a summary of the pending (GENERATED) DDTs and marks them SENT.
 * Requires a configured `courierEmail` on the company.
 */
export class SendCourierSummaryEmailUseCase {
  constructor(
    private readonly deliveryNoteRepository: IDeliveryNoteRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly emailSender: EmailSender,
  ) {}

  async execute(companyId: string): Promise<CourierSummaryResult> {
    const entries = await this.deliveryNoteRepository.findManyByCompany(companyId, {
      status: DeliveryNoteStatus.GENERATED,
    });
    if (entries.length === 0) {
      return { sent: 0, recipients: 0, courierEmail: '' };
    }
    const courierEmail = await this.companyRepository.getCourierEmail(companyId);
    if (!courierEmail) {
      throw AppError.badRequest('Courier email is not configured', 'COURIER_EMAIL_NOT_SET');
    }
    const company = await this.companyRepository.findById(companyId);
    const notes = entries.map((entry) => entry.deliveryNote);
    const summary = aggregateShippingSummary(notes);
    const companyName = company?.name ?? 'Azienda';
    await this.emailSender.sendRawEmail({
      to: courierEmail,
      subject: `Riepilogo spedizioni — ${companyName}`,
      text: `Riepilogo di ${summary.totals.ddtCount} DDT da spedire (${summary.totals.packagesCount} colli).`,
      html: renderCourierSummaryHtml({ companyName, summary }),
    });
    for (const note of notes) {
      await this.deliveryNoteRepository.markSent(note.id);
    }
    const recipients = new Set(notes.map((note) => note.customerSnapshot.name)).size;
    return { sent: notes.length, recipients, courierEmail };
  }
}
