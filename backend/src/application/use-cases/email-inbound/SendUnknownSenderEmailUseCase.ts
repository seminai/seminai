import { EmailService } from '../../../infrastructure/services/EmailService';
import { buildUnknownSenderEmail } from '../../../infrastructure/services/email-ingestion/templates/unknown-sender.template';

interface SendUnknownSenderEmailInput {
  readonly to: string;
}

/**
 * Notifies the sender that their address is not recognised
 * or has no companies associated, so the email was ignored.
 */
export class SendUnknownSenderEmailUseCase {
  constructor(private readonly emailService: EmailService = EmailService.getInstance()) {}

  async execute(input: SendUnknownSenderEmailInput): Promise<void> {
    const { subject, text, html } = buildUnknownSenderEmail();
    await this.emailService.sendRawEmail({ to: input.to, subject, text, html });
  }
}
