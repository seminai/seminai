import { type EmailIngestion } from '../../../domain/entities/EmailIngestion';
import { type ParsedInboundEmailDto } from '../../../domain/dtos/email-inbound.dto';
import { EmailIngestionError } from '../../../domain/errors/EmailIngestionError';
import { type IEmailIngestionRepository } from '../../../domain/repositories/IEmailIngestionRepository';
import { FileService } from '../../../infrastructure/services/FileService';
import { type DispatchToAgentUseCase } from './DispatchToAgentUseCase';
import { type ResolveSenderUseCase } from './ResolveSenderUseCase';

interface HandleDisambiguationReplyInput {
  readonly parsedEmail: ParsedInboundEmailDto;
  readonly currentIngestionId: string;
}

interface HandleDisambiguationReplyResult {
  readonly status:
    | 'resolved'
    | 'token_invalid'
    | 'spoofing'
    | 'choice_unparseable'
    | 'choice_out_of_range';
  readonly threadId?: string;
  readonly chosenCompanyId?: string;
  readonly userId?: string;
  readonly originalSubject?: string;
  readonly attachmentNames?: ReadonlyArray<string>;
}

const TOKEN_REGEX = /\b(INGEST-[a-zA-Z0-9_-]{4,})\b/;
const CHOICE_REGEX = /(?:AZIENDA|COMPANY)\s*[:=#]?\s*(\d{1,3})/i;
const BARE_NUMBER_REGEX = /^\s*(\d{1,3})\s*$/m;

/**
 * Handles a reply to a previously sent disambiguation-request email.
 * On success, fetches the original attachments from storage and dispatches
 * to the agent for the user-chosen company.
 */
export class HandleDisambiguationReplyUseCase {
  constructor(
    private readonly emailIngestionRepository: IEmailIngestionRepository,
    private readonly resolveSenderUseCase: ResolveSenderUseCase,
    private readonly dispatchToAgentUseCase: DispatchToAgentUseCase,
    private readonly fileService: FileService = new FileService(),
  ) {}

  async execute(input: HandleDisambiguationReplyInput): Promise<HandleDisambiguationReplyResult> {
    const token = this.extractToken(input.parsedEmail.subject);
    if (!token) return { status: 'token_invalid' };
    const draft = await this.emailIngestionRepository.findByDisambiguationToken(token);
    if (!draft) return { status: 'token_invalid' };
    if (draft.fromAddress.toLowerCase() !== input.parsedEmail.fromAddress.toLowerCase()) {
      return { status: 'spoofing' };
    }
    const chosenIndex = this.parseChoice(input.parsedEmail.bodyText);
    if (!chosenIndex) return { status: 'choice_unparseable' };
    const resolution = await this.resolveSenderUseCase.execute({ fromAddress: draft.fromAddress });
    if (resolution.kind !== 'multiple') return { status: 'token_invalid' };
    if (chosenIndex < 1 || chosenIndex > resolution.candidates.length) {
      return { status: 'choice_out_of_range' };
    }
    const chosenCompanyId = resolution.candidates[chosenIndex - 1].companyId;
    const attachments = await this.loadOriginalAttachments(draft);
    const dispatchResult = await this.dispatchToAgentUseCase.execute({
      userId: resolution.userId,
      companyId: chosenCompanyId,
      emailIngestionId: input.currentIngestionId,
      subject: draft.subject ?? '(no subject)',
      bodyText: draft.bodyText ?? '',
      attachments,
    });
    await this.emailIngestionRepository.update(draft.id, {
      status: 'DISPATCHED',
      companyId: chosenCompanyId,
      threadId: dispatchResult.threadId,
      dispatchedAt: new Date(),
    });
    return {
      status: 'resolved',
      threadId: dispatchResult.threadId,
      chosenCompanyId,
      userId: resolution.userId,
      originalSubject: draft.subject,
      attachmentNames: attachments.map((a) => a.fileName),
    };
  }

  private extractToken(subject: string): string | null {
    const match = TOKEN_REGEX.exec(subject);
    return match ? match[1] : null;
  }

  private parseChoice(bodyText: string): number | null {
    const explicit = CHOICE_REGEX.exec(bodyText);
    if (explicit) return Number.parseInt(explicit[1], 10);
    const bare = BARE_NUMBER_REGEX.exec(bodyText.trim());
    return bare ? Number.parseInt(bare[1], 10) : null;
  }

  private async loadOriginalAttachments(
    draft: EmailIngestion,
  ): Promise<ReadonlyArray<{ buffer: Buffer; fileName: string; mimeType: string }>> {
    const rows = await this.emailIngestionRepository.findAttachmentsByIngestionId(draft.id);
    if (rows.length === 0) {
      throw EmailIngestionError.attachmentLimitExceeded(
        `Original ingestion ${draft.id} has no stored attachments`,
      );
    }
    const out: Array<{ buffer: Buffer; fileName: string; mimeType: string }> = [];
    for (const row of rows) {
      const multerFile = await this.fileService.getFileFromUrl(row.storageUrl);
      out.push({ buffer: multerFile.buffer, fileName: row.fileName, mimeType: row.mimeType });
    }
    return out;
  }
}
