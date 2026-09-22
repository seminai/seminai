import type {
  EmailIngestionLimitsDto,
  ParsedInboundEmailDto,
} from '../../../domain/dtos/email-inbound.dto';
import type { EmailIngestion } from '../../../domain/entities/EmailIngestion';
import type { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import type { IEmailIngestionRepository } from '../../../domain/repositories/IEmailIngestionRepository';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import type { EmailIngestionAttachmentStorage } from '../../../infrastructure/services/email-ingestion/EmailIngestionAttachmentStorage';
import type { DispatchToAgentUseCase } from './DispatchToAgentUseCase';
import type { HandleDisambiguationReplyUseCase } from './HandleDisambiguationReplyUseCase';
import type { ResolveSenderUseCase } from './ResolveSenderUseCase';
import type { SendDisambiguationRequestEmailUseCase } from './SendDisambiguationRequestEmailUseCase';
import type { SendIngestionConfirmationEmailUseCase } from './SendIngestionConfirmationEmailUseCase';
import type { SendOptOutEmailUseCase } from './SendOptOutEmailUseCase';
import type { SendUnknownSenderEmailUseCase } from './SendUnknownSenderEmailUseCase';

export interface ProcessInboundEmailDeps {
  readonly emailIngestionRepository: IEmailIngestionRepository;
  readonly userRepository: IUserRepository;
  readonly companyRepository: ICompanyRepository;
  readonly attachmentStorage: EmailIngestionAttachmentStorage;
  readonly resolveSenderUseCase: ResolveSenderUseCase;
  readonly dispatchToAgentUseCase: DispatchToAgentUseCase;
  readonly handleDisambiguationReplyUseCase: HandleDisambiguationReplyUseCase;
  readonly sendDisambiguationRequestEmailUseCase: SendDisambiguationRequestEmailUseCase;
  readonly sendIngestionConfirmationEmailUseCase: SendIngestionConfirmationEmailUseCase;
  readonly sendUnknownSenderEmailUseCase: SendUnknownSenderEmailUseCase;
  readonly sendOptOutEmailUseCase: SendOptOutEmailUseCase;
  readonly limits: EmailIngestionLimitsDto;
}

export interface ProcessInboundEmailResult {
  readonly outcome:
    | 'duplicate'
    | 'unknown_sender'
    | 'opt_out'
    | 'no_companies'
    | 'awaiting_disambiguation'
    | 'dispatched'
    | 'no_attachments'
    | 'disambiguation_reply_resolved'
    | 'disambiguation_reply_invalid'
    | 'limit_exceeded';
  readonly ingestionId?: string;
  readonly threadId?: string;
}

export interface HandleMultipleInput {
  readonly parsedEmail: ParsedInboundEmailDto;
  readonly ingestion: EmailIngestion;
  readonly resolution: Extract<
    Awaited<ReturnType<ResolveSenderUseCase['execute']>>,
    { kind: 'multiple' }
  >;
}

export interface DispatchSingleInput {
  readonly parsedEmail: ParsedInboundEmailDto;
  readonly ingestion: EmailIngestion;
  readonly resolution: Awaited<ReturnType<ResolveSenderUseCase['execute']>>;
}

export interface SendConfirmationSingleInput {
  readonly parsedEmail: ParsedInboundEmailDto;
  readonly threadId: string;
  readonly companyId: string;
  readonly userId: string;
}
