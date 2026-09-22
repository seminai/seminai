import { prisma } from './Prisma';
import {
  type IFileExtractionRepository,
  type FileExtractionRecord,
  type CreateFileExtractionInput,
  type FilterOptionsResult,
  type ListFileExtractionRecordsInput,
  type ListFileExtractionRecordsResult,
  type UpdateFileExtractionInput,
} from '../../domain/repositories/IFileExtractionRepository';
import {
  type CompanyExtractionCategorySummary,
  type ExtractionData,
  type ResolvedCategory,
} from '../../domain/dtos/file-extraction.dto';
import { type FileExtractionStatus, type Prisma } from '@prisma/client';
import { sanitizeForJsonb } from '../services/extraction/jsonb-sanitizer';

function toRecord(row: {
  id: string;
  batchId: string;
  status: FileExtractionStatus;
  category: string;
  progress: number;
  extractedData: unknown;
  error: string | null;
  fileName: string;
  fileIndex: number;
  fileId: string | null;
  companyId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  file?: { url: string } | null;
}): FileExtractionRecord {
  return {
    id: row.id,
    batchId: row.batchId,
    status: row.status,
    category: row.category,
    progress: row.progress,
    extractedData: (row.extractedData as ExtractionData) ?? null,
    error: row.error,
    fileName: row.fileName,
    fileIndex: row.fileIndex,
    fileId: row.fileId,
    fileUrl: row.file?.url ?? null,
    companyId: row.companyId,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const FILE_SELECT = { url: true } as const;

export class PrismaFileExtractionRepository implements IFileExtractionRepository {
  async create(input: CreateFileExtractionInput): Promise<FileExtractionRecord> {
    const row = await prisma.fileExtraction.create({
      data: {
        batchId: input.batchId,
        category: input.category,
        fileName: input.fileName,
        fileIndex: input.fileIndex,
        fileId: input.fileId,
        companyId: input.companyId,
        userId: input.userId,
      },
      include: { file: { select: FILE_SELECT } },
    });
    return toRecord(row);
  }

  async findById(id: string): Promise<FileExtractionRecord | null> {
    const row = await prisma.fileExtraction.findUnique({
      where: { id },
      include: { file: { select: FILE_SELECT } },
    });
    return row ? toRecord(row) : null;
  }

  async findByBatchId(batchId: string): Promise<FileExtractionRecord[]> {
    const rows = await prisma.fileExtraction.findMany({
      where: { batchId },
      orderBy: { fileIndex: 'asc' },
      include: { file: { select: FILE_SELECT } },
    });
    return rows.map(toRecord);
  }

  async findByCompanyId(companyId: string): Promise<FileExtractionRecord[]> {
    const rows = await prisma.fileExtraction.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { file: { select: FILE_SELECT } },
    });
    return rows.map(toRecord);
  }

  async findManyForList(
    input: ListFileExtractionRecordsInput,
  ): Promise<ListFileExtractionRecordsResult> {
    if (input.allowedCompanyIds.length === 0) {
      return { records: [], total: 0 };
    }
    const where = buildListWhere(input);
    const orderBy = buildListOrderBy(input.sortBy, input.sortOrder);
    const skip = Math.max(input.offset, 0);
    const take = Math.max(input.limit, 0);
    const total = await prisma.fileExtraction.count({ where });
    if (take === 0) {
      return { records: [], total };
    }
    const rows = await prisma.fileExtraction.findMany({
      where,
      skip,
      take,
      orderBy,
      include: { file: { select: FILE_SELECT } },
    });
    return {
      records: rows.map(toRecord),
      total,
    };
  }

  async findFilterOptions(allowedCompanyIds: readonly string[]): Promise<FilterOptionsResult> {
    if (allowedCompanyIds.length === 0) {
      return { fileNames: [], companyNames: [], statuses: [], categories: [], formats: [] };
    }
    const where = { companyId: { in: [...allowedCompanyIds] } };
    const [fileNames, companies, statuses, categories] = await Promise.all([
      prisma.fileExtraction.findMany({
        where,
        distinct: ['fileName'],
        select: { fileName: true },
        orderBy: { fileName: 'asc' },
      }),
      prisma.company.findMany({
        where: { id: { in: [...allowedCompanyIds] } },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.fileExtraction.findMany({
        where,
        distinct: ['status'],
        select: { status: true },
      }),
      prisma.fileExtraction.findMany({
        where,
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      }),
    ]);
    const formatSet = new Set<string>();
    fileNames.forEach((row) => {
      const ext = row.fileName.split('.').pop();
      if (ext) formatSet.add(`.${ext}`);
    });
    return {
      fileNames: fileNames.map((row) => row.fileName),
      companyNames: companies.map((row) => row.name),
      statuses: statuses.map((row) => row.status),
      categories: categories.map((row) => row.category),
      formats: [...formatSet].sort(),
    };
  }

  async findCategorySummaryByCompanyIds(
    companyIds: readonly string[],
  ): Promise<readonly CompanyExtractionCategorySummary[]> {
    if (companyIds.length === 0) {
      return [];
    }
    const rows = await prisma.fileExtraction.findMany({
      where: { companyId: { in: [...companyIds] } },
      distinct: ['companyId', 'category'],
      select: { companyId: true, category: true },
    });
    const grouped = new Map<string, Set<ResolvedCategory>>();
    rows.forEach((row) => {
      const categories = grouped.get(row.companyId) ?? new Set<ResolvedCategory>();
      categories.add(row.category as ResolvedCategory);
      grouped.set(row.companyId, categories);
    });
    return Array.from(grouped.entries()).map(([companyId, categories]) => ({
      companyId,
      categories: [...categories],
    }));
  }

  async update(id: string, data: UpdateFileExtractionInput): Promise<FileExtractionRecord> {
    const row = await prisma.fileExtraction.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.progress !== undefined && { progress: data.progress }),
        ...(data.extractedData !== undefined && {
          extractedData: sanitizeForJsonb(data.extractedData) as unknown as Prisma.InputJsonValue,
        }),
        ...(data.error !== undefined && { error: data.error }),
        ...(data.category !== undefined && { category: data.category }),
      },
      include: { file: { select: FILE_SELECT } },
    });
    return toRecord(row);
  }

  async deleteById(id: string): Promise<void> {
    await prisma.fileExtraction.delete({ where: { id } });
  }

  async deleteManyByIds(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await prisma.fileExtraction.deleteMany({
      where: { id: { in: [...ids] } },
    });
    return result.count;
  }

  async deleteManyByFileIds(fileIds: readonly string[]): Promise<number> {
    if (fileIds.length === 0) return 0;
    const result = await prisma.fileExtraction.deleteMany({
      where: { fileId: { in: [...fileIds] } },
    });
    return result.count;
  }
}

function buildListWhere(input: ListFileExtractionRecordsInput): Prisma.FileExtractionWhereInput {
  const hasCompanyFilter = !!input.companyId;
  const q = input.q?.trim();
  const updatedAtRange: Prisma.DateTimeFilter | undefined =
    input.updatedAtFrom || input.updatedAtTo
      ? {
          ...(input.updatedAtFrom ? { gte: input.updatedAtFrom } : {}),
          ...(input.updatedAtTo ? { lte: input.updatedAtTo } : {}),
        }
      : undefined;
  return {
    companyId: hasCompanyFilter ? input.companyId : { in: [...input.allowedCompanyIds] },
    ...(input.status && input.status.length > 0 ? { status: { in: [...input.status] } } : {}),
    ...(input.category && input.category.length > 0
      ? { category: { in: [...input.category] } }
      : {}),
    ...(q
      ? {
          OR: [
            { fileName: { contains: q, mode: 'insensitive' } },
            { company: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
    ...(updatedAtRange ? { updatedAt: updatedAtRange } : {}),
  };
}

function buildListOrderBy(
  sortBy: ListFileExtractionRecordsInput['sortBy'],
  sortOrder: ListFileExtractionRecordsInput['sortOrder'],
): Prisma.FileExtractionOrderByWithRelationInput[] {
  const direction: Prisma.SortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
  if (sortBy === 'fileName') return [{ fileName: direction }, { updatedAt: 'desc' }];
  if (sortBy === 'status') return [{ status: direction }, { updatedAt: 'desc' }];
  if (sortBy === 'category') return [{ category: direction }, { updatedAt: 'desc' }];
  return [{ updatedAt: direction }];
}
