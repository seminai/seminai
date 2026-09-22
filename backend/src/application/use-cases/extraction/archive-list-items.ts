import { CompanyKind } from '@prisma/client';
import type { Company } from '../../../domain/entities/Company';
import type {
  ArchiveGeneratedType,
  ArchiveListItemResponse,
  ListFileExtractionsQuery,
  ResolvedCategory,
} from '../../../domain/dtos/file-extraction.dto';
import type { JobGroupSummaryDTO } from '../../../domain/dtos/job-group-summary.dto';
import type { FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';

export function toArchiveExtractionItem(
  record: FileExtractionRecord,
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

interface BuildGeneratedItemsInput {
  readonly companies: readonly Company[];
  readonly jobGroups: readonly JobGroupSummaryDTO[];
  readonly query: ListFileExtractionsQuery;
}

export function buildGeneratedItems(input: BuildGeneratedItemsInput): ArchiveListItemResponse[] {
  if (input.query.status && input.query.status.length > 0) return [];
  const companyKindMap = new Map(input.companies.map((company) => [company.id, company.kind]));
  const targetCompanies = input.query.companyId
    ? input.companies.filter((company) => company.id === input.query.companyId)
    : [...input.companies];
  const q = input.query.q?.trim().toLowerCase();
  const fileNames = input.query.fileNames?.map((name) => name.toLowerCase());
  const items = [...targetCompanies]
    .sort((left, right) => left.name.localeCompare(right.name, 'it'))
    .flatMap((company) =>
      buildCompanyGeneratedItems(
        company.id,
        company.name,
        company.updatedAt.toISOString(),
        company.kind,
      ),
    )
    .filter((item) => matchesGeneratedItem(item, input.query, q, fileNames));
  const jobGroupItems = input.jobGroups
    .filter((group) => !input.query.companyId || group.company.id === input.query.companyId)
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
    .filter((item) => matchesGeneratedItem(item, input.query, q, fileNames));
  return sortGeneratedItems([...items, ...jobGroupItems], input.query);
}

function matchesGeneratedItem(
  item: ArchiveListItemResponse,
  query: ListFileExtractionsQuery,
  q: string | undefined,
  fileNames: readonly string[] | undefined,
): boolean {
  if (!matchesGeneratedCategoryFilter(item.generatedType!, query.category)) return false;
  if (!matchesUpdatedAtRange(item.updatedAt, query)) return false;
  if (fileNames && !fileNames.some((name) => item.fileName.toLowerCase().includes(name))) {
    return false;
  }
  if (!q) return true;
  return (
    item.fileName.toLowerCase().includes(q) ||
    item.companyName.toLowerCase().includes(q) ||
    (item.note?.toLowerCase().includes(q) ?? false)
  );
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
  kind: CompanyKind,
): ArchiveListItemResponse[] {
  const items = [
    generatedItem({
      id: `company-${companyId}`,
      companyId,
      companyName,
      generatedType: 'company',
      fileName: 'Azienda',
      updatedAt,
    }),
  ];
  if (kind !== CompanyKind.MANUFACTURING) {
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

interface GeneratedItemInput {
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly generatedType: ArchiveGeneratedType;
  readonly fileName: string;
  readonly updatedAt: string;
  readonly note?: string;
  readonly totalOperations?: number;
  readonly verifiedOperations?: number;
  readonly pendingOperations?: number;
}

function generatedItem(input: GeneratedItemInput): ArchiveListItemResponse {
  return {
    ...input,
    kind: 'generated',
    status: 'GENERATED',
    category: input.generatedType,
    fileUrl: null,
    batchId: null,
    progress: 100,
    error: null,
  };
}

function matchesGeneratedCategoryFilter(
  generatedType: ArchiveGeneratedType,
  categoryFilter?: readonly ResolvedCategory[],
): boolean {
  if (!categoryFilter || categoryFilter.length === 0) return true;
  if (generatedType === 'company' || generatedType === 'job_group') return false;
  if (generatedType === 'products') {
    return categoryFilter.includes('stock') || categoryFilter.includes('invoice');
  }
  if (generatedType === 'fields') {
    return categoryFilter.includes('fields') || categoryFilter.includes('agricultural');
  }
  return categoryFilter.includes('production_units') || categoryFilter.includes('agricultural');
}

const STATUS_PRIORITY: Readonly<Record<string, number>> = {
  LOADING: 0,
  PENDING_CONFIRMATION: 1,
  CONFIRMED: 2,
  ERROR: 3,
};

function sortGeneratedItems(
  items: ArchiveListItemResponse[],
  query: ListFileExtractionsQuery,
): ArchiveListItemResponse[] {
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    if (query.sortBy === 'fileName') {
      return left.fileName.localeCompare(right.fileName, 'it') * direction;
    }
    if (query.sortBy === 'category') {
      return String(left.category).localeCompare(String(right.category), 'it') * direction;
    }
    if (query.sortBy === 'status') {
      return (
        ((STATUS_PRIORITY[left.status] ?? 99) - (STATUS_PRIORITY[right.status] ?? 99)) * direction
      );
    }
    return (new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime()) * direction;
  });
}
