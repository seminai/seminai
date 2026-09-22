import { CompanyKind, type FileExtractionStatus } from '@prisma/client';
import {
  type ArchiveGeneratedType,
  type ArchiveListItemResponse,
  type FileExtractionResponse,
  type ListFileExtractionsQuery,
  type ListFileExtractionsResponse,
  type ResolvedCategory,
} from '../../../domain/dtos/file-extraction.dto';
import { AppError } from '../../../domain/errors/AppError';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type IFileExtractionRepository } from '../../../domain/repositories/IFileExtractionRepository';
import { type IJobRepository } from '../../../domain/repositories/IJobRepository';

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
          categorySummary: await this.extractionRepository.findCategorySummaryByCompanyIds(
            input.query.companyId ? [input.query.companyId] : allowedCompanyIds,
          ),
          jobGroups: await this.jobRepository.findJobGroupsSummaryByUserId(input.userId),
          query: input.query,
        })
      : [];
    const generatedCount = generatedItems.length;
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
    const extractionSlotsUsed = extractionItems.length;
    const remainingSlots = Math.max(input.query.pageSize - extractionSlotsUsed, 0);
    const generatedOffset = Math.max(pageOffset - result.total, 0);
    const generatedSlice = input.query.includeGenerated
      ? generatedItems.slice(generatedOffset, generatedOffset + remainingSlots)
      : [];
    const items = [...extractionItems, ...generatedSlice];
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
      items,
      totalItems: result.total + generatedCount,
      page: input.query.page,
      pageSize: input.query.pageSize,
    };
  }
}

function toArchiveExtractionItem(
  record: import('../../../domain/repositories/IFileExtractionRepository').FileExtractionRecord,
  companyName: string,
): ArchiveListItemResponse {
  return {
    kind: 'extraction',
    id: record.id,
    companyId: record.companyId,
    companyName,
    fileName: record.fileName,
    updatedAt: record.updatedAt.toISOString(),
    status: record.status,
    category: record.category as ResolvedCategory,
    fileUrl: record.fileUrl,
    fileId: record.fileId,
    batchId: record.batchId,
    progress: record.progress,
    error: record.error,
  };
}

function buildGeneratedItems(input: {
  companies: readonly import('../../../domain/entities/Company').Company[];
  categorySummary: readonly import('../../../domain/dtos/file-extraction.dto').CompanyExtractionCategorySummary[];
  jobGroups: readonly import('../../../domain/dtos/job-group-summary.dto').JobGroupSummaryDTO[];
  query: ListFileExtractionsQuery;
}): ArchiveListItemResponse[] {
  if (input.query.status && input.query.status.length > 0) {
    return [];
  }
  const categoryMap = new Map(
    input.categorySummary.map((entry) => [entry.companyId, new Set(entry.categories)]),
  );
  const companyKindMap = new Map(input.companies.map((company) => [company.id, company.kind]));
  const targetCompanies = input.query.companyId
    ? input.companies.filter((company) => company.id === input.query.companyId)
    : [...input.companies];
  const sortedCompanies = [...targetCompanies].sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const q = input.query.q?.trim().toLowerCase();
  const fileNames = input.query.fileNames?.map((n: string) => n.toLowerCase());
  const items: ArchiveListItemResponse[] = [];
  for (const company of sortedCompanies) {
    const categories = categoryMap.get(company.id) ?? new Set<ResolvedCategory>();
    const candidateItems = buildCompanyGeneratedItems(
      company.id,
      company.name,
      company.updatedAt.toISOString(),
      categories,
      company.kind,
    );
    candidateItems.forEach((item) => {
      if (!matchesGeneratedCategoryFilter(item.generatedType!, input.query.category)) return;
      if (!matchesUpdatedAtRange(item.updatedAt, input.query)) return;
      if (
        q &&
        !item.fileName.toLowerCase().includes(q) &&
        !item.companyName.toLowerCase().includes(q)
      ) {
        return;
      }
      if (fileNames && !fileNames.some((fn) => item.fileName.toLowerCase().includes(fn))) {
        return;
      }
      items.push(item);
    });
  }
  const jobGroupItems = input.jobGroups
    .filter((group) => (input.query.companyId ? group.company.id === input.query.companyId : true))
    .filter((group) => companyKindMap.get(group.company.id) !== CompanyKind.MANUFACTURING)
    .map((group) =>
      generatedItem({
        id: `jobs-${group.company.id}-${encodeURIComponent(group.jobId)}`,
        companyId: group.company.id,
        companyName: group.company.name,
        generatedType: 'job_group',
        fileName: 'Gruppo operazioni',
        updatedAt: group.createdAt.toISOString(),
        note: `${group.totalOperations} operazioni`,
        totalOperations: group.totalOperations,
        verifiedOperations: group.verifiedOperations,
        pendingOperations: group.pendingOperations,
      }),
    )
    .filter((item) => {
      if (!matchesGeneratedCategoryFilter(item.generatedType!, input.query.category)) return false;
      if (!matchesUpdatedAtRange(item.updatedAt, input.query)) return false;
      if (fileNames && !fileNames.some((fn: string) => item.fileName.toLowerCase().includes(fn)))
        return false;
      if (!q) return true;
      return (
        item.fileName.toLowerCase().includes(q) ||
        item.companyName.toLowerCase().includes(q) ||
        (item.note?.toLowerCase().includes(q) ?? false)
      );
    });
  return sortGeneratedItems([...items, ...jobGroupItems], input.query);
}

function matchesUpdatedAtRange(updatedAtIso: string, query: ListFileExtractionsQuery): boolean {
  if (!query.updatedAtFrom && !query.updatedAtTo) return true;
  const time = new Date(updatedAtIso).getTime();
  if (Number.isNaN(time)) return false;
  if (query.updatedAtFrom && time < query.updatedAtFrom.getTime()) return false;
  if (query.updatedAtTo && time > query.updatedAtTo.getTime()) return false;
  return true;
}

function buildCompanyGeneratedItems(
  companyId: string,
  companyName: string,
  updatedAt: string,
  _categories: ReadonlySet<ResolvedCategory>,
  kind: CompanyKind,
): ArchiveListItemResponse[] {
  const isManufacturing = kind === CompanyKind.MANUFACTURING;
  const items: ArchiveListItemResponse[] = [
    generatedItem({
      id: `company-${companyId}`,
      companyId,
      companyName,
      generatedType: 'company',
      fileName: 'Azienda',
      updatedAt,
    }),
  ];
  if (!isManufacturing) {
    items.push(
      generatedItem({
        id: `fields-${companyId}`,
        companyId,
        companyName,
        generatedType: 'fields',
        fileName: 'Campi',
        updatedAt,
      }),
      generatedItem({
        id: `pu-${companyId}`,
        companyId,
        companyName,
        generatedType: 'production_units',
        fileName: 'Unità Produttive',
        updatedAt,
      }),
    );
  }
  items.push(
    generatedItem({
      id: `products-${companyId}`,
      companyId,
      companyName,
      generatedType: 'products',
      fileName: 'Magazzino',
      updatedAt,
    }),
  );
  return items;
}

function generatedItem(input: {
  id: string;
  companyId: string;
  companyName: string;
  generatedType: ArchiveGeneratedType;
  fileName: string;
  updatedAt: string;
  note?: string;
  totalOperations?: number;
  verifiedOperations?: number;
  pendingOperations?: number;
}): ArchiveListItemResponse {
  return {
    kind: 'generated',
    id: input.id,
    companyId: input.companyId,
    companyName: input.companyName,
    fileName: input.fileName,
    updatedAt: input.updatedAt,
    status: 'GENERATED',
    category: input.generatedType,
    generatedType: input.generatedType,
    fileUrl: null,
    batchId: null,
    progress: 100,
    error: null,
    note: input.note,
    totalOperations: input.totalOperations,
    verifiedOperations: input.verifiedOperations,
    pendingOperations: input.pendingOperations,
  };
}

function matchesGeneratedCategoryFilter(
  generatedType: ArchiveGeneratedType,
  categoryFilter?: readonly ResolvedCategory[],
): boolean {
  if (!categoryFilter || categoryFilter.length === 0) return true;
  if (generatedType === 'company') return false;
  if (generatedType === 'job_group') return false;
  if (generatedType === 'products') {
    return categoryFilter.includes('stock') || categoryFilter.includes('invoice');
  }
  if (generatedType === 'fields') {
    return categoryFilter.includes('fields') || categoryFilter.includes('agricultural');
  }
  return categoryFilter.includes('production_units') || categoryFilter.includes('agricultural');
}

const STATUS_PRIORITY: Record<string, number> = {
  LOADING: 0,
  PENDING_CONFIRMATION: 1,
  CONFIRMED: 2,
  ERROR: 3,
};

function statusPriority(status: string): number {
  return STATUS_PRIORITY[status] ?? 99;
}

function sortGeneratedItems(
  items: ArchiveListItemResponse[],
  query: ListFileExtractionsQuery,
): ArchiveListItemResponse[] {
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  const sortBy = query.sortBy;
  const sorted = [...items].sort((left, right) => {
    if (sortBy === 'fileName') return left.fileName.localeCompare(right.fileName, 'it') * direction;
    if (sortBy === 'category')
      return String(left.category).localeCompare(String(right.category), 'it') * direction;
    if (sortBy === 'status')
      return (statusPriority(left.status) - statusPriority(right.status)) * direction;
    return (new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()) * direction;
  });
  return sorted;
}
