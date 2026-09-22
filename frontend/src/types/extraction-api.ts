import type {
  ConfirmableStockEntry,
  FileExtractionResponse,
  ResolvedCategory,
} from './extraction';
import type { FileExtractionStatus } from '@/types/prisma';

export type ArchiveGeneratedType =
  | 'company'
  | 'fields'
  | 'production_units'
  | 'products'
  | 'job_group';

export interface ArchiveListItem {
  readonly kind: 'extraction' | 'generated';
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly fileName: string;
  readonly updatedAt: string;
  readonly status: FileExtractionStatus | 'GENERATED';
  readonly category: ResolvedCategory | ArchiveGeneratedType;
  readonly fileUrl: string | null;
  readonly fileId?: string | null;
  readonly batchId: string | null;
  readonly progress: number;
  readonly error: string | null;
  readonly note?: string;
  readonly generatedType?: ArchiveGeneratedType;
  readonly totalOperations?: number;
  readonly verifiedOperations?: number;
  readonly pendingOperations?: number;
}

export interface FileExtractionListPayload {
  readonly extractions: readonly FileExtractionResponse[];
  readonly total: number;
  readonly items?: readonly ArchiveListItem[];
  readonly totalItems?: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CompanyExtractionCategorySummary {
  readonly companyId: string;
  readonly categories: readonly ResolvedCategory[];
}

export interface BatchExtractionStartResponse {
  readonly batchId: string;
  readonly extractions: ReadonlyArray<{
    readonly id: string;
    readonly fileIndex: number;
    readonly fileName: string;
    readonly category: ResolvedCategory;
    readonly status: FileExtractionStatus;
  }>;
}

export interface ConfirmExtractionPayload {
  readonly warehouseId?: string;
  readonly invoiceEntries?: readonly ConfirmableStockEntry[];
}
