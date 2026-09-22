import type { PrismaClient } from '@prisma/client';
import type {
  ExtractionApiAccountRecord,
  IExtractionApiAccountRepository,
} from '../../domain/repositories/IExtractionApiAccountRepository';
import type { ExtractionApiAccountSummary } from '../../domain/dtos/extraction-api.dto';

export class PrismaExtractionApiAccountRepository implements IExtractionApiAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createForUser(userId: string, pageQuota: number): Promise<ExtractionApiAccountRecord> {
    const created = await this.prisma.extractionApiAccount.create({
      data: { userId, pageQuota, pagesUsed: 0 },
    });
    return this.toRecord(created);
  }

  async findByUserId(userId: string): Promise<ExtractionApiAccountRecord | null> {
    const row = await this.prisma.extractionApiAccount.findUnique({ where: { userId } });
    return row ? this.toRecord(row) : null;
  }

  async addPageQuota(userId: string, addPages: number): Promise<ExtractionApiAccountRecord> {
    const updated = await this.prisma.extractionApiAccount.update({
      where: { userId },
      data: { pageQuota: { increment: addPages } },
    });
    return this.toRecord(updated);
  }

  async consumePages(userId: string, pages: number): Promise<ExtractionApiAccountRecord> {
    const updated = await this.prisma.extractionApiAccount.update({
      where: { userId },
      data: { pagesUsed: { increment: pages } },
    });
    return this.toRecord(updated);
  }

  toSummary(record: ExtractionApiAccountRecord): ExtractionApiAccountSummary {
    return {
      pageQuota: record.pageQuota,
      pagesUsed: record.pagesUsed,
      pagesRemaining: Math.max(record.pageQuota - record.pagesUsed, 0),
    };
  }

  private toRecord(row: {
    id: string;
    userId: string;
    pageQuota: number;
    pagesUsed: number;
  }): ExtractionApiAccountRecord {
    return {
      id: row.id,
      userId: row.userId,
      pageQuota: row.pageQuota,
      pagesUsed: row.pagesUsed,
    };
  }
}
