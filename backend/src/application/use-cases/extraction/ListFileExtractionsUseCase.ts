import type { FileExtractionStatus } from '@prisma/client';
import type {
  FileExtractionResponse,
  ListFileExtractionsQuery,
  ListFileExtractionsResponse,
} from '../../../domain/dtos/file-extraction.dto';
import { AppError } from '../../../domain/errors/AppError';
import type { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import type { IFileExtractionRepository } from '../../../domain/repositories/IFileExtractionRepository';
import type { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { buildGeneratedItems, toArchiveExtractionItem } from './archive-list-items';

interface ListFileExtractionsInput {
  readonly userId: string;
  readonly query: ListFileExtractionsQuery;
}

export class ListFileExtractionsUseCase {
  constructor(
    private readonly extractionRepository: IFileExtractionRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly jobRepository: IJobRepository,
  ) {}

  async execute(input: ListFileExtractionsInput): Promise<ListFileExtractionsResponse> {
    if (!input.userId) {
      throw AppError.badRequest('User identifier is required', 'USER_ID_REQUIRED');
    }
    const companies = await this.companyRepository.findManyByUserId(input.userId);
    const allowedCompanyIds = companies.map((company) => company.id);
    if (allowedCompanyIds.length === 0) {
      return {
        extractions: [],
        total: 0,
        items: [],
        totalItems: 0,
        page: input.query.page,
        pageSize: input.query.pageSize,
      };
    }
    if (input.query.companyId && !allowedCompanyIds.includes(input.query.companyId)) {
      throw AppError.forbidden('Company is not accessible for this user', 'COMPANY_ACCESS_DENIED');
    }
    const generatedItems = input.query.includeGenerated
      ? buildGeneratedItems({
          companies,
          jobGroups: await this.jobRepository.findJobGroupsSummaryByUserId(input.userId),
          query: input.query,
        })
      : [];
    const pageOffset = (input.query.page - 1) * input.query.pageSize;
    const result = await this.extractionRepository.findManyForList({
      allowedCompanyIds,
      companyId: input.query.companyId,
      offset: pageOffset,
      limit: input.query.pageSize,
      q: input.query.q,
      status: input.query.status as readonly FileExtractionStatus[] | undefined,
      category: input.query.category,
      sortBy: input.query.sortBy,
      sortOrder: input.query.sortOrder,
      updatedAtFrom: input.query.updatedAtFrom,
      updatedAtTo: input.query.updatedAtTo,
    });
    const companyNameById = new Map(companies.map((company) => [company.id, company.name]));
    const extractionItems = result.records.map((record) =>
      toArchiveExtractionItem(record, companyNameById.get(record.companyId) ?? 'Sconosciuta'),
    );
    const remainingSlots = Math.max(input.query.pageSize - extractionItems.length, 0);
    const generatedOffset = Math.max(pageOffset - result.total, 0);
    const generatedSlice = input.query.includeGenerated
      ? generatedItems.slice(generatedOffset, generatedOffset + remainingSlots)
      : [];
    return {
      extractions: result.records.map((record) => ({
        id: record.id,
        batchId: record.batchId,
        companyId: record.companyId,
        status: record.status,
        category: record.category as FileExtractionResponse['category'],
        progress: record.progress,
        fileName: record.fileName,
        fileIndex: record.fileIndex,
        fileId: record.fileId,
        fileUrl: record.fileUrl,
        extractedData: record.extractedData,
        error: record.error,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      })),
      total: result.total,
      items: [...extractionItems, ...generatedSlice],
      totalItems: result.total + generatedItems.length,
      page: input.query.page,
      pageSize: input.query.pageSize,
    };
  }
}
