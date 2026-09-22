import { type EmailIngestionStatus } from '@prisma/client';
import { type EmailIngestion } from '../entities/EmailIngestion';
import { type EmailAttachment } from '../entities/EmailAttachment';

export interface CreateEmailIngestionInput {
  readonly messageId: string;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly subject?: string;
  readonly bodyText?: string;
  readonly rawHeaders?: Record<string, string>;
  readonly parentIngestionId?: string;
}

export interface UpdateEmailIngestionInput {
  readonly status?: EmailIngestionStatus;
  readonly userId?: string;
  readonly companyId?: string;
  readonly threadId?: string;
  readonly errorMessage?: string;
  readonly disambiguationToken?: string;
  readonly dispatchedAt?: Date;
}

export interface EmailAttachmentSeed {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly storageUrl: string;
  readonly storagePath: string;
}

export interface FindEmailIngestionsByCompanyQuery {
  readonly companyId: string;
  readonly statuses: ReadonlyArray<EmailIngestionStatus>;
  /** Lower bound on `receivedAt`; when omitted no time filter is applied. */
  readonly since?: Date;
}

export interface IEmailIngestionRepository {
  create(input: CreateEmailIngestionInput): Promise<EmailIngestion>;
  findById(id: string): Promise<EmailIngestion | null>;
  findByMessageId(messageId: string): Promise<EmailIngestion | null>;
  /** Company-scoped lookup of ingestions in the given statuses (newest first). */
  findManyByCompany(
    query: FindEmailIngestionsByCompanyQuery,
  ): Promise<ReadonlyArray<EmailIngestion>>;
  findByDisambiguationToken(token: string): Promise<EmailIngestion | null>;
  findAttachmentsByIngestionId(ingestionId: string): Promise<ReadonlyArray<EmailAttachment>>;
  update(id: string, patch: UpdateEmailIngestionInput): Promise<EmailIngestion>;
  attachFiles(
    ingestionId: string,
    seeds: ReadonlyArray<EmailAttachmentSeed>,
  ): Promise<ReadonlyArray<EmailAttachment>>;
}
