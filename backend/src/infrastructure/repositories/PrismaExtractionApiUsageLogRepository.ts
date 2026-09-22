import type { PrismaClient } from '@prisma/client';
import type {
  CreateExtractionApiUsageLogInput,
  ExtractionApiUsageLogRecord,
  IExtractionApiUsageLogRepository,
  ListExtractionApiUsageParams,
} from '../../domain/repositories/IExtractionApiUsageLogRepository';

export class PrismaExtractionApiUsageLogRepository implements IExtractionApiUsageLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateExtractionApiUsageLogInput): Promise<ExtractionApiUsageLogRecord> {
    const created = await this.prisma.extractionApiUsageLog.create({
      data: {
        userId: input.userId,
        apiKeyId: input.apiKeyId,
        documentType: input.documentType,
        detectedType: input.detectedType,
        fileName: input.fileName,
        pagesProcessed: input.pagesProcessed,
        pagesCharged: input.pagesCharged,
      },
    });
    return this.toRecord(created);
  }

  async listByUser(params: ListExtractionApiUsageParams): Promise<{
    readonly items: ReadonlyArray<ExtractionApiUsageLogRecord>;
    readonly total: number;
  }> {
    const skip = (params.page - 1) * params.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.extractionApiUsageLog.findMany({
        where: { userId: params.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.pageSize,
      }),
      this.prisma.extractionApiUsageLog.count({ where: { userId: params.userId } }),
    ]);
    return { items: items.map((row) => this.toRecord(row)), total };
  }

  private toRecord(row: {
    id: string;
    userId: string;
    apiKeyId: string | null;
    documentType: string;
    detectedType: string | null;
    fileName: string | null;
    pagesProcessed: number;
    pagesCharged: number;
    createdAt: Date;
  }): ExtractionApiUsageLogRecord {
    return {
      id: row.id,
      userId: row.userId,
      apiKeyId: row.apiKeyId,
      documentType: row.documentType,
      detectedType: row.detectedType,
      fileName: row.fileName,
      pagesProcessed: row.pagesProcessed,
      pagesCharged: row.pagesCharged,
      createdAt: row.createdAt,
    };
  }
}
