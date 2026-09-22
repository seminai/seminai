import { PrismaClient, DisciplinariExtraction } from '@prisma/client';
import {
  DisciplinariExtractionSummary,
  DisciplinariValidityCheck,
} from '../../domain/dtos/disciplinari.dto';
import { DisciplinariExtractionInput } from './disciplinari-extraction-input';
import {
  checkDisciplinariValidity,
  countDisciplinariByRegion,
  getDisciplinariStats,
  listDisciplinariSummary,
} from './prisma-disciplinari-reporting';

export { DisciplinariExtractionInput } from './disciplinari-extraction-input';

/**
 * Repository for disciplinari extraction operations.
 */
export class PrismaDisciplinariExtractionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds a disciplinari extraction by its file hash (SHA256).
   */
  async findByHash(fileHash: string): Promise<DisciplinariExtraction | null> {
    return this.prisma.disciplinariExtraction.findUnique({
      where: { fileHash },
    });
  }

  /**
   * Finds a disciplinari extraction by ID.
   */
  async findById(id: string): Promise<DisciplinariExtraction | null> {
    return this.prisma.disciplinariExtraction.findUnique({
      where: { id },
    });
  }

  /**
   * Finds disciplinari extractions by region and year.
   */
  async findByRegionAndYear(region: string, year: number): Promise<DisciplinariExtraction[]> {
    return this.prisma.disciplinariExtraction.findMany({
      where: {
        region: {
          equals: region,
          mode: 'insensitive',
        },
        year,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Finds disciplinari extractions by region, year, and title.
   */
  async findByRegionYearTitle(
    region: string,
    year: number,
    title: string,
  ): Promise<DisciplinariExtraction | null> {
    return this.prisma.disciplinariExtraction.findFirst({
      where: {
        region: {
          equals: region,
          mode: 'insensitive',
        },
        year,
        title: {
          equals: title,
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Finds all expired disciplinari extractions.
   */
  async findExpired(): Promise<DisciplinariExtraction[]> {
    const now = new Date();
    return this.prisma.disciplinariExtraction.findMany({
      where: {
        OR: [
          { isExpired: true },
          {
            validUntil: {
              lt: now,
            },
          },
        ],
      },
      orderBy: { validUntil: 'asc' },
    });
  }

  /**
   * Finds all disciplinari extractions that will expire within the given days.
   */
  async findExpiringSoon(days: number): Promise<DisciplinariExtraction[]> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.prisma.disciplinariExtraction.findMany({
      where: {
        validUntil: {
          gte: now,
          lte: futureDate,
        },
        isExpired: false,
      },
      orderBy: { validUntil: 'asc' },
    });
  }

  /**
   * Updates the isExpired status for all expired disciplinari.
   * Should be run as a scheduled job.
   */
  async updateExpiredStatus(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.disciplinariExtraction.updateMany({
      where: {
        validUntil: {
          lt: now,
        },
        isExpired: false,
      },
      data: {
        isExpired: true,
      },
    });
    return result.count;
  }

  /**
   * Creates a new disciplinari extraction.
   */
  async create(data: DisciplinariExtractionInput): Promise<DisciplinariExtraction> {
    return this.prisma.disciplinariExtraction.create({
      data: {
        fileHash: data.fileHash,
        fileName: data.fileName,
        sourceUrl: data.sourceUrl,
        region: data.region,
        year: data.year,
        version: data.version,
        title: data.title,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isExpired: data.isExpired ?? false,
        rawText: data.rawText,
        extractedData: data.extractedData as never,
        extractionConfidence: data.extractionConfidence,
        extractionErrors: data.extractionErrors,
        createdById: data.createdById,
      },
    });
  }

  /**
   * Updates an existing disciplinari extraction.
   */
  async update(
    id: string,
    data: Partial<DisciplinariExtractionInput>,
  ): Promise<DisciplinariExtraction> {
    return this.prisma.disciplinariExtraction.update({
      where: { id },
      data: {
        ...(data.fileName && { fileName: data.fileName }),
        ...(data.sourceUrl && { sourceUrl: data.sourceUrl }),
        ...(data.region && { region: data.region }),
        ...(data.year && { year: data.year }),
        ...(data.version !== undefined && { version: data.version }),
        ...(data.title && { title: data.title }),
        ...(data.validFrom !== undefined && { validFrom: data.validFrom }),
        ...(data.validUntil !== undefined && { validUntil: data.validUntil }),
        ...(data.isExpired !== undefined && { isExpired: data.isExpired }),
        ...(data.rawText && { rawText: data.rawText }),
        ...(data.extractedData !== undefined ? { extractedData: data.extractedData as never } : {}),
        ...(data.extractionConfidence !== undefined && {
          extractionConfidence: data.extractionConfidence,
        }),
        ...(data.extractionErrors && { extractionErrors: data.extractionErrors }),
      },
    });
  }

  /**
   * Upserts a disciplinari extraction by file hash.
   */
  async upsertByHash(data: DisciplinariExtractionInput): Promise<DisciplinariExtraction> {
    return this.prisma.disciplinariExtraction.upsert({
      where: { fileHash: data.fileHash },
      create: {
        fileHash: data.fileHash,
        fileName: data.fileName,
        sourceUrl: data.sourceUrl,
        region: data.region,
        year: data.year,
        version: data.version,
        title: data.title,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isExpired: data.isExpired ?? false,
        rawText: data.rawText,
        extractedData: data.extractedData as never,
        extractionConfidence: data.extractionConfidence,
        extractionErrors: data.extractionErrors,
        createdById: data.createdById,
      },
      update: {
        fileName: data.fileName,
        sourceUrl: data.sourceUrl,
        region: data.region,
        year: data.year,
        version: data.version,
        title: data.title,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isExpired: data.isExpired ?? false,
        rawText: data.rawText,
        extractedData: data.extractedData as never,
        extractionConfidence: data.extractionConfidence,
        extractionErrors: data.extractionErrors,
      },
    });
  }

  /**
   * Deletes a disciplinari extraction by ID.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.disciplinariExtraction.delete({
      where: { id },
    });
  }

  /**
   * Deletes multiple disciplinari extractions by IDs.
   */
  async deleteManyByIds(ids: string[]): Promise<number> {
    const result = await this.prisma.disciplinariExtraction.deleteMany({
      where: {
        id: { in: ids },
      },
    });
    return result.count;
  }

  /**
   * Lists all disciplinari extractions with summary info.
   */
  async listSummary(): Promise<DisciplinariExtractionSummary[]> {
    return listDisciplinariSummary(this.prisma);
  }

  /**
   * Checks the validity of a disciplinare by region and year.
   */
  async checkValidity(region: string, year: number): Promise<DisciplinariValidityCheck> {
    const extractions = await this.findByRegionAndYear(region, year);

    return checkDisciplinariValidity(extractions);
  }

  /**
   * Counts total extractions by region.
   */
  async countByRegion(): Promise<Array<{ region: string; count: number }>> {
    return countDisciplinariByRegion(this.prisma);
  }

  /**
   * Gets statistics about extractions.
   */
  async getStats(): Promise<{
    total: number;
    expired: number;
    valid: number;
    avgConfidence: number;
    byRegion: Array<{ region: string; count: number }>;
    byYear: Array<{ year: number; count: number }>;
  }> {
    return getDisciplinariStats(this.prisma);
  }
}
