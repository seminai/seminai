import {
  type EmailAttachment as PrismaEmailAttachment,
  type EmailIngestion as PrismaEmailIngestion,
} from '@prisma/client';
import { prisma } from './Prisma';
import { EmailAttachment } from '../../domain/entities/EmailAttachment';
import { EmailIngestion } from '../../domain/entities/EmailIngestion';
import {
  type CreateEmailIngestionInput,
  type EmailAttachmentSeed,
  type FindEmailIngestionsByCompanyQuery,
  type IEmailIngestionRepository,
  type UpdateEmailIngestionInput,
} from '../../domain/repositories/IEmailIngestionRepository';

function toIngestion(row: PrismaEmailIngestion): EmailIngestion {
  return new EmailIngestion(
    row.id,
    row.messageId,
    row.status,
    row.fromAddress,
    row.toAddress,
    row.receivedAt,
    row.subject ?? undefined,
    row.bodyText ?? undefined,
    row.threadId ?? undefined,
    row.userId ?? undefined,
    row.companyId ?? undefined,
    row.parentIngestionId ?? undefined,
    row.disambiguationToken ?? undefined,
    row.errorMessage ?? undefined,
    row.dispatchedAt ?? undefined,
  );
}

function toAttachment(row: PrismaEmailAttachment): EmailAttachment {
  return new EmailAttachment(
    row.id,
    row.ingestionId,
    row.fileName,
    row.mimeType,
    row.sizeBytes,
    row.gcsUrl,
    row.gcsPath,
    row.createdAt,
    row.fileId ?? undefined,
  );
}

export class PrismaEmailIngestionRepository implements IEmailIngestionRepository {
  async create(input: CreateEmailIngestionInput): Promise<EmailIngestion> {
    const row = await prisma.emailIngestion.create({
      data: {
        messageId: input.messageId,
        fromAddress: input.fromAddress,
        toAddress: input.toAddress,
        subject: input.subject,
        bodyText: input.bodyText,
        rawHeaders: input.rawHeaders ? (input.rawHeaders as object) : undefined,
        parentIngestionId: input.parentIngestionId,
      },
    });
    return toIngestion(row);
  }

  async findById(id: string): Promise<EmailIngestion | null> {
    const row = await prisma.emailIngestion.findUnique({ where: { id } });
    return row ? toIngestion(row) : null;
  }

  async findByMessageId(messageId: string): Promise<EmailIngestion | null> {
    const row = await prisma.emailIngestion.findUnique({ where: { messageId } });
    return row ? toIngestion(row) : null;
  }

  async findByDisambiguationToken(token: string): Promise<EmailIngestion | null> {
    const row = await prisma.emailIngestion.findUnique({ where: { disambiguationToken: token } });
    return row ? toIngestion(row) : null;
  }

  async findManyByCompany(
    query: FindEmailIngestionsByCompanyQuery,
  ): Promise<ReadonlyArray<EmailIngestion>> {
    const rows = await prisma.emailIngestion.findMany({
      where: {
        companyId: query.companyId,
        status: { in: [...query.statuses] },
        ...(query.since ? { receivedAt: { gte: query.since } } : {}),
      },
      orderBy: { receivedAt: 'desc' },
    });
    return rows.map(toIngestion);
  }

  async findAttachmentsByIngestionId(ingestionId: string): Promise<ReadonlyArray<EmailAttachment>> {
    const rows = await prisma.emailAttachment.findMany({
      where: { ingestionId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAttachment);
  }

  async update(id: string, patch: UpdateEmailIngestionInput): Promise<EmailIngestion> {
    const row = await prisma.emailIngestion.update({
      where: { id },
      data: {
        status: patch.status,
        userId: patch.userId,
        companyId: patch.companyId,
        threadId: patch.threadId,
        errorMessage: patch.errorMessage,
        disambiguationToken: patch.disambiguationToken,
        dispatchedAt: patch.dispatchedAt,
      },
    });
    return toIngestion(row);
  }

  async attachFiles(
    ingestionId: string,
    seeds: ReadonlyArray<EmailAttachmentSeed>,
  ): Promise<ReadonlyArray<EmailAttachment>> {
    if (seeds.length === 0) return [];
    await prisma.emailAttachment.createMany({
      data: seeds.map((seed) => ({
        ingestionId,
        fileName: seed.fileName,
        mimeType: seed.mimeType,
        sizeBytes: seed.sizeBytes,
        gcsUrl: seed.gcsUrl,
        gcsPath: seed.gcsPath,
      })),
    });
    return this.findAttachmentsByIngestionId(ingestionId);
  }
}
