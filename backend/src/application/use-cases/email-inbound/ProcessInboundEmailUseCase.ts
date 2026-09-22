import { randomBytes } from 'node:crypto';
import { type ParsedInboundEmailDto } from '../../../domain/dtos/email-inbound.dto';
import { type EmailIngestion } from '../../../domain/entities/EmailIngestion';
import type {
  DispatchSingleInput,
  HandleMultipleInput,
  ProcessInboundEmailDeps,
  ProcessInboundEmailResult,
  SendConfirmationSingleInput,
} from './process-inbound-email.types';

export type {
  ProcessInboundEmailDeps,
  ProcessInboundEmailResult,
} from './process-inbound-email.types';

const TOKEN_REGEX = /\bINGEST-[a-zA-Z0-9_-]{4,}\b/;

/**
 * Master orchestrator for inbound emails.
 * Idempotent on Message-ID; branches on disambiguation reply vs new ingestion.
 */
export class ProcessInboundEmailUseCase {
  constructor(private readonly deps: ProcessInboundEmailDeps) {}

  async execute(parsedEmail: ParsedInboundEmailDto): Promise<ProcessInboundEmailResult> {
    const duplicate = await this.deps.emailIngestionRepository.findByMessageId(
      parsedEmail.messageId,
    );
    if (duplicate) return { outcome: 'duplicate', ingestionId: duplicate.id };
    if (this.exceedsLimits(parsedEmail)) {
      const ingestion = await this.createIngestion(parsedEmail);
      await this.deps.emailIngestionRepository.update(ingestion.id, {
        status: 'FAILED',
        errorMessage: 'Attachment limits exceeded',
      });
      return { outcome: 'limit_exceeded', ingestionId: ingestion.id };
    }
    if (this.isDisambiguationReply(parsedEmail)) {
      return this.processDisambiguationReply(parsedEmail);
    }
    return this.processNewIngestion(parsedEmail);
  }

  private exceedsLimits(parsedEmail: ParsedInboundEmailDto): boolean {
    const totalBytes = parsedEmail.attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
    if (parsedEmail.attachments.length > this.deps.limits.maxAttachments) return true;
    if (totalBytes > this.deps.limits.maxTotalBytes) return true;
    if (parsedEmail.attachments.some((a) => a.sizeBytes > this.deps.limits.maxPerFileBytes))
      return true;
    return false;
  }

  private isDisambiguationReply(parsedEmail: ParsedInboundEmailDto): boolean {
    return TOKEN_REGEX.test(parsedEmail.subject);
  }

  private async processDisambiguationReply(
    parsedEmail: ParsedInboundEmailDto,
  ): Promise<ProcessInboundEmailResult> {
    const ingestion = await this.createIngestion(parsedEmail);
    const result = await this.deps.handleDisambiguationReplyUseCase.execute({
      parsedEmail,
      currentIngestionId: ingestion.id,
    });
    if (result.status !== 'resolved') {
      await this.deps.emailIngestionRepository.update(ingestion.id, {
        status: 'FAILED',
        errorMessage: `Disambiguation reply ${result.status}`,
      });
      return { outcome: 'disambiguation_reply_invalid', ingestionId: ingestion.id };
    }
    await this.deps.emailIngestionRepository.update(ingestion.id, {
      status: 'DISPATCHED',
      threadId: result.threadId,
      companyId: result.chosenCompanyId,
      dispatchedAt: new Date(),
    });
    await this.sendConfirmationAfterDisambiguation({
      to: parsedEmail.fromAddress,
      threadId: result.threadId!,
      userId: result.userId!,
      companyId: result.chosenCompanyId!,
      originalSubject: result.originalSubject ?? parsedEmail.subject,
      attachmentNames: result.attachmentNames ?? [],
    });
    return {
      outcome: 'disambiguation_reply_resolved',
      ingestionId: ingestion.id,
      threadId: result.threadId,
    };
  }

  private async sendConfirmationAfterDisambiguation(input: {
    readonly to: string;
    readonly threadId: string;
    readonly userId: string;
    readonly companyId: string;
    readonly originalSubject: string;
    readonly attachmentNames: ReadonlyArray<string>;
  }): Promise<void> {
    const user = await this.deps.userRepository.findById(input.userId);
    const company = await this.deps.companyRepository.findById(input.companyId);
    await this.deps.sendIngestionConfirmationEmailUseCase.execute({
      to: input.to,
      userName: user?.name ?? 'utente',
      companyName: company?.name ?? '(selezionata)',
      originalSubject: this.stripReplyPrefix(input.originalSubject),
      attachmentNames: input.attachmentNames,
      threadId: input.threadId,
    });
  }

  private stripReplyPrefix(subject: string): string {
    return subject.replace(/^(\s*Re:\s*)+/i, '').trim();
  }

  private async processNewIngestion(
    parsedEmail: ParsedInboundEmailDto,
  ): Promise<ProcessInboundEmailResult> {
    if (parsedEmail.attachments.length === 0) {
      const ingestion = await this.createIngestion(parsedEmail);
      await this.deps.emailIngestionRepository.update(ingestion.id, {
        status: 'IGNORED_NO_ATTACHMENTS',
      });
      return { outcome: 'no_attachments', ingestionId: ingestion.id };
    }
    const resolution = await this.deps.resolveSenderUseCase.execute({
      fromAddress: parsedEmail.fromAddress,
    });
    if (resolution.kind === 'unknown') {
      const ingestion = await this.createIngestion(parsedEmail);
      await this.deps.emailIngestionRepository.update(ingestion.id, {
        status: 'IGNORED_UNKNOWN_SENDER',
      });
      await this.deps.sendUnknownSenderEmailUseCase.execute({ to: parsedEmail.fromAddress });
      return { outcome: 'unknown_sender', ingestionId: ingestion.id };
    }
    if (resolution.kind === 'opt_out') {
      const ingestion = await this.createIngestion(parsedEmail);
      await this.deps.emailIngestionRepository.update(ingestion.id, {
        status: 'IGNORED_OPT_OUT',
        userId: resolution.userId,
        errorMessage: 'Email ingestion disabled in user Settings',
      });
      await this.deps.sendOptOutEmailUseCase.execute({ to: parsedEmail.fromAddress });
      return { outcome: 'opt_out', ingestionId: ingestion.id };
    }
    const ingestion = await this.persistIngestionWithAttachments({
      parsedEmail,
      userId: resolution.userId,
    });
    if (resolution.kind === 'no_companies') {
      await this.deps.emailIngestionRepository.update(ingestion.id, {
        status: 'IGNORED_UNKNOWN_SENDER',
        userId: resolution.userId,
        errorMessage: 'User has no associated companies',
      });
      await this.deps.sendUnknownSenderEmailUseCase.execute({ to: parsedEmail.fromAddress });
      return { outcome: 'no_companies', ingestionId: ingestion.id };
    }
    if (resolution.kind === 'multiple') {
      return this.handleMultipleCompanies({ parsedEmail, ingestion, resolution });
    }
    return this.dispatchSingle({ parsedEmail, ingestion, resolution });
  }

  private async handleMultipleCompanies(
    input: HandleMultipleInput,
  ): Promise<ProcessInboundEmailResult> {
    const token = `INGEST-${randomBytes(6).toString('hex')}`;
    const truncatedCandidates = input.resolution.candidates.slice(
      0,
      this.deps.limits.maxCompaniesInDisambiguation,
    );
    await this.deps.emailIngestionRepository.update(input.ingestion.id, {
      status: 'AWAITING_DISAMBIGUATION',
      userId: input.resolution.userId,
      disambiguationToken: token,
    });
    const user = await this.deps.userRepository.findById(input.resolution.userId);
    await this.deps.sendDisambiguationRequestEmailUseCase.execute({
      to: input.parsedEmail.fromAddress,
      userName: user?.name ?? 'utente',
      originalSubject: input.parsedEmail.subject,
      candidates: truncatedCandidates,
      token,
    });
    return { outcome: 'awaiting_disambiguation', ingestionId: input.ingestion.id };
  }

  private async dispatchSingle(input: DispatchSingleInput): Promise<ProcessInboundEmailResult> {
    if (input.resolution.kind !== 'single') {
      return { outcome: 'dispatched', ingestionId: input.ingestion.id };
    }
    const dispatchResult = await this.deps.dispatchToAgentUseCase.execute({
      userId: input.resolution.userId,
      companyId: input.resolution.companyId,
      emailIngestionId: input.ingestion.id,
      subject: input.parsedEmail.subject,
      bodyText: input.parsedEmail.bodyText,
      attachments: input.parsedEmail.attachments.map((a) => ({
        buffer: a.buffer,
        fileName: a.fileName,
        mimeType: a.mimeType,
      })),
    });
    await this.deps.emailIngestionRepository.update(input.ingestion.id, {
      status: 'DISPATCHED',
      userId: input.resolution.userId,
      companyId: input.resolution.companyId,
      threadId: dispatchResult.threadId,
      dispatchedAt: new Date(),
    });
    await this.sendConfirmationForSingle({
      parsedEmail: input.parsedEmail,
      threadId: dispatchResult.threadId,
      companyId: input.resolution.companyId,
      userId: input.resolution.userId,
    });
    return {
      outcome: 'dispatched',
      ingestionId: input.ingestion.id,
      threadId: dispatchResult.threadId,
    };
  }

  private async createIngestion(parsedEmail: ParsedInboundEmailDto): Promise<EmailIngestion> {
    return this.deps.emailIngestionRepository.create({
      messageId: parsedEmail.messageId,
      fromAddress: parsedEmail.fromAddress,
      toAddress: parsedEmail.toAddresses[0] ?? '',
      subject: parsedEmail.subject,
      bodyText: parsedEmail.bodyText,
      rawHeaders: parsedEmail.rawHeaders,
    });
  }

  private async persistIngestionWithAttachments(input: {
    readonly parsedEmail: ParsedInboundEmailDto;
    readonly userId?: string;
  }): Promise<EmailIngestion> {
    const ingestion = await this.createIngestion(input.parsedEmail);
    const seeds = await this.deps.attachmentStorage.storeAll({
      attachments: input.parsedEmail.attachments,
      userId: input.userId,
      messageId: input.parsedEmail.messageId,
    });
    await this.deps.emailIngestionRepository.attachFiles(ingestion.id, seeds);
    return ingestion;
  }

  private async sendConfirmationForSingle(input: SendConfirmationSingleInput): Promise<void> {
    const user = await this.deps.userRepository.findById(input.userId);
    const company = await this.deps.companyRepository.findById(input.companyId);
    if (!user || !company) return;
    await this.deps.sendIngestionConfirmationEmailUseCase.execute({
      to: input.parsedEmail.fromAddress,
      userName: user.name,
      companyName: company.name,
      originalSubject: input.parsedEmail.subject,
      attachmentNames: input.parsedEmail.attachments.map((a) => a.fileName),
      threadId: input.threadId,
    });
  }
}
