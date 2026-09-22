import { BusinessPartner } from '../../../domain/entities/BusinessPartner';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { EmailSender } from '../delivery-note/SendCourierSummaryEmailUseCase';
import { buildClientFollowUpEmail } from '../../../infrastructure/services/email-templates/client-followup.template';

export interface ClientFollowUpResult {
  readonly sent: boolean;
}

/**
 * Emails a single customer the order-collection reminder and stamps
 * `followUpLastSentAt`. No-ops (without stamping) when the partner has no email.
 */
export class SendClientFollowUpUseCase {
  constructor(
    private readonly companyRepository: ICompanyRepository,
    private readonly partnerRepository: IBusinessPartnerRepository,
    private readonly emailSender: EmailSender,
  ) {}

  async execute(partner: BusinessPartner): Promise<ClientFollowUpResult> {
    if (!partner.email) {
      return { sent: false };
    }
    const company = await this.companyRepository.findById(partner.companyId);
    const companyName = company?.name ?? 'La tua azienda';
    const email = buildClientFollowUpEmail({ partnerName: partner.name, companyName });
    await this.emailSender.sendRawEmail({
      to: partner.email,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    await this.partnerRepository.update(partner.id, { followUpLastSentAt: new Date() });
    return { sent: true };
  }
}
