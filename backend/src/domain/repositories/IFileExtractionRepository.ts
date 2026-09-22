import { type FileExtractionStatus } from '@prisma/client';
import {
  type CompanyExtractionCategorySummary,
  type ExtractionData,
  type FileExtractionListSortBy,
  type FileExtractionListSortOrder,
  type ResolvedCategory,
} from '../dtos/file-extraction.dto';

export interface FileExtractionRecord {
  readonly id: string;
  readonly batchId: string;
  readonly status: FileExtractionStatus;
  readonly category: string;
  readonly progress: number;
  readonly extractedData: ExtractionData | null;
  readonly error: string | null;
  readonly fileName: string;
  readonly fileIndex: number;
  readonly fileId: string | null;
  readonly fileUrl: string | null;
  readonly companyId: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateFileExtractionInput {
  readonly batchId: string;
  readonly category: ResolvedCategory;
  readonly fileName: string;
  readonly fileIndex: number;
  readonly fileId: string | null;
  readonly companyId: string;
  readonly userId: string;
}

export interface UpdateFileExtractionInput {
  readonly status?: FileExtractionStatus;
  readonly progress?: number;
  readonly extractedData?: ExtractionData;
  readonly error?: string;
  readonly category?: ResolvedCategory;
}

export interface ListFileExtractionRecordsInput {
  readonly allowedCompanyIds: readonly string[];
  readonly companyId?: string;
  readonly offset: number;
  readonly limit: number;
  readonly q?: string;
  readonly status?: readonly FileExtractionStatus[];
  readonly category?: readonly ResolvedCategory[];
  readonly sortBy: FileExtractionListSortBy;
  readonly sortOrder: FileExtractionListSortOrder;
  readonly updatedAtFrom?: Date;
  readonly updatedAtTo?: Date;
}

export interface ListFileExtractionRecordsResult {
  readonly records: readonly FileExtractionRecord[];
  readonly total: number;
}

export interface FilterOptionsResult {
  readonly fileNames: readonly string[];
  readonly companyNames: readonly string[];
  readonly statuses: readonly string[];
  readonly categories: readonly string[];
  readonly formats: readonly string[];
}

export interface IFileExtractionRepository {
  create(input: CreateFileExtractionInput): Promise<FileExtractionRecord>;
  findById(id: string): Promise<FileExtractionRecord | null>;
  findByBatchId(batchId: string): Promise<FileExtractionRecord[]>;
  findByCompanyId(companyId: string): Promise<FileExtractionRecord[]>;
  findManyForList(input: ListFileExtractionRecordsInput): Promise<ListFileExtractionRecordsResult>;
  findFilterOptions(allowedCompanyIds: readonly string[]): Promise<FilterOptionsResult>;
  findCategorySummaryByCompanyIds(
    companyIds: readonly string[],
  ): Promise<readonly CompanyExtractionCategorySummary[]>;
  update(id: string, data: UpdateFileExtractionInput): Promise<FileExtractionRecord>;
  deleteById(id: string): Promise<void>;
  /** Removes extractions by id. Used by bulk archive deletion to clean up rows visible in the archive. */
  deleteManyByIds(ids: readonly string[]): Promise<number>;
  /** Removes extractions linked to the given files (when the underlying File is being deleted). */
  deleteManyByFileIds(fileIds: readonly string[]): Promise<number>;
}
