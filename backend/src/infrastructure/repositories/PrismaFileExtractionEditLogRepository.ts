import { Prisma, type FileExtractionEditSource } from '@prisma/client';
import { prisma } from './Prisma';
import {
  type AppendEditLogInput,
  type EditLogWithExtractionAndFileRecord,
  type ExportEditLogsFilter,
  type FileExtractionEditLogRecord,
  type IFileExtractionEditLogRepository,
} from '../../domain/repositories/IFileExtractionEditLogRepository';
import { sanitizeForJsonb } from '../services/extraction/jsonb-sanitizer';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

interface RawLogRow {
  id: string;
  extractionId: string;
  version: number;
  source: FileExtractionEditSource;
  beforeData: Prisma.JsonValue | null;
  afterData: Prisma.JsonValue;
  userId: string | null;
  createdAt: Date;
}

function toRecord(row: RawLogRow): FileExtractionEditLogRecord {
  return {
    id: row.id,
    extractionId: row.extractionId,
    version: row.version,
    source: row.source,
    beforeData: row.beforeData ?? null,
    afterData: row.afterData,
    userId: row.userId,
    createdAt: row.createdAt,
  };
}

export class PrismaFileExtractionEditLogRepository implements IFileExtractionEditLogRepository {
  async append(input: AppendEditLogInput): Promise<FileExtractionEditLogRecord> {
    return this.appendWithRetry(input, true);
  }

  private async appendWithRetry(
    input: AppendEditLogInput,
    allowRetry: boolean,
  ): Promise<FileExtractionEditLogRecord> {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const aggregate = await tx.fileExtractionEditLog.aggregate({
          where: { extractionId: input.extractionId },
          _max: { version: true },
        });
        const nextVersion = (aggregate._max.version ?? -1) + 1;
        return tx.fileExtractionEditLog.create({
          data: {
            extractionId: input.extractionId,
            version: nextVersion,
            source: input.source,
            beforeData: sanitizeForJsonb(input.beforeData) as Prisma.InputJsonValue | undefined,
            afterData: sanitizeForJsonb(input.afterData) as Prisma.InputJsonValue,
            userId: input.userId,
          },
        });
      });
      return toRecord(row);
    } catch (error) {
      if (
        allowRetry &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        return this.appendWithRetry(input, false);
      }
      throw error;
    }
  }

  async findByExtractionId(extractionId: string): Promise<readonly FileExtractionEditLogRecord[]> {
    const rows = await prisma.fileExtractionEditLog.findMany({
      where: { extractionId },
      orderBy: { version: 'asc' },
    });
    return rows.map(toRecord);
  }

  async findConfirmedInvoiceAndDdtLogs(
    filter: ExportEditLogsFilter,
  ): Promise<readonly EditLogWithExtractionAndFileRecord[]> {
    const rows = await prisma.fileExtraction.findMany({
      where: {
        status: 'CONFIRMED',
        category: { in: ['invoice', 'ddt'] },
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
        ...(filter.since || filter.until
          ? {
              updatedAt: {
                ...(filter.since ? { gte: filter.since } : {}),
                ...(filter.until ? { lte: filter.until } : {}),
              },
            }
          : {}),
      },
      include: {
        file: { select: { url: true } },
        editLogs: { orderBy: { version: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      extractionId: row.id,
      category: row.category,
      companyId: row.companyId,
      fileName: row.fileName,
      fileUrl: row.file?.url ?? null,
      logs: row.editLogs.map(toRecord),
    }));
  }
}
