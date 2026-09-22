import { EmailService } from '../../../infrastructure/services/EmailService';
import { buildOptOutEmail } from '../../../infrastructure/services/email-ingestion/templates/opt-out.template';

interface SendOptOutEmailInput {
  readonly to: string;
}

/**
 * Notifies a known Seminai user that they need to enable the email
 * integration in Settings before inbound emails are processed.
 */
export class SendOptOutEmailUseCase {
  constructor(private readonly emailService: EmailService = EmailService.getInstance()) {}

  async execute(input: SendOptOutEmailInput): Promise<void> {
    const { subject, text, html } = buildOptOutEmail();
    await this.emailService.sendRawEmail({ to: input.to, subject, text, html });
  }
}
