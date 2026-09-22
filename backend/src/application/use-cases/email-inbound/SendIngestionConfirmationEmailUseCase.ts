import { EmailService } from '../../../infrastructure/services/EmailService';
import { buildIngestionConfirmationEmail } from '../../../infrastructure/services/email-ingestion/templates/ingestion-confirmation.template';

interface SendIngestionConfirmationEmailInput {
  readonly to: string;
  readonly userName: string;
  readonly companyName: string;
  readonly originalSubject: string;
  readonly attachmentNames: ReadonlyArray<string>;
  readonly threadId: string;
}

/**
 * Sends the post-dispatch riepilogo to the sender.
 * Always includes a deep link to the chat in the webapp so the user
 * can review and approve any pending tool calls (e.g. import_from_file).
 */
export class SendIngestionConfirmationEmailUseCase {
  constructor(private readonly emailService: EmailService = EmailService.getInstance()) {}

  async execute(input: SendIngestionConfirmationEmailInput): Promise<void> {
    const { subject, text, html } = buildIngestionConfirmationEmail({
      userName: input.userName,
      companyName: input.companyName,
      originalSubject: input.originalSubject,
      attachmentNames: input.attachmentNames,
      threadId: input.threadId,
    });
    await this.emailService.sendRawEmail({ to: input.to, subject, text, html });
  }
}
