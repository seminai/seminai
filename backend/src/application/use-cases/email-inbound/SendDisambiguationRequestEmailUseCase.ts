import { type DisambiguationCandidateDto } from '../../../domain/dtos/email-inbound.dto';
import { EmailService } from '../../../infrastructure/services/EmailService';
import { buildDisambiguationRequestEmail } from '../../../infrastructure/services/email-ingestion/templates/disambiguation-request.template';

interface SendDisambiguationRequestEmailInput {
  readonly to: string;
  readonly userName: string;
  readonly originalSubject: string;
  readonly candidates: ReadonlyArray<DisambiguationCandidateDto>;
  readonly token: string;
}

/**
 * Sends a numbered reply asking the user to pick the target company.
 * The reply subject carries `[INGEST-<token>]` so the user's reply
 * can be matched back to the pending ingestion.
 */
export class SendDisambiguationRequestEmailUseCase {
  constructor(private readonly emailService: EmailService = EmailService.getInstance()) {}

  async execute(input: SendDisambiguationRequestEmailInput): Promise<void> {
    const { subject, text, html } = buildDisambiguationRequestEmail({
      userName: input.userName,
      originalSubject: input.originalSubject,
      candidates: input.candidates,
      token: input.token,
    });
    await this.emailService.sendRawEmail({ to: input.to, subject, text, html });
  }
}
