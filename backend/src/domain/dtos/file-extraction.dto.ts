import { type FileExtractionStatus } from '@prisma/client';
import { type InvoiceEntry } from './invoice-entry.dto';
import { type DdtEntry } from './ddt-entry.dto';
import { type StockPreviewEntry } from '../../infrastructure/services/agents/dosage_agent_react/tools/file-extraction-types';

/** Categories the user can specify when uploading files. */
export type BatchExtractionCategory =
  | 'fields'
  | 'production_units'
  | 'agricultural'
  | 'invoice'
  | 'ddt'
  | 'stock'
  | 'auto';

/** Categories resolved after auto-detection. */
export type ResolvedCategory =
  | 'fields'
  | 'production_units'
  | 'agricultural'
  | 'invoice'
  | 'ddt'
  | 'stock';

/** Preview of an extracted field (mirrors FieldController.FieldBulkPreview). */
export interface FieldBulkPreview {
  readonly companyId: string;
  readonly name: string;
  readonly coordinates: number[];
  readonly coordinatesGaussBoaga: number[];
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly polygon: unknown | null;
  readonly polygonGaussBoaga: unknown | null;
  readonly gisHa: number | null;
  readonly sauHa: number | null;
  readonly ph: number | null;
  readonly nitrogen: number | null;
  readonly phosphorus: number | null;
  readonly potassium: number | null;
  readonly calcium: number | null;
  readonly magnesium: number | null;
  readonly soilType: string | null;
  readonly uso: string | null;
  readonly qualita: string | null;
  readonly superficieCatastaleMq: number | null;
  readonly sezione: string | null;
  readonly foglio: string | null;
  readonly particella: string | null;
  readonly subalterno: string | null;
  readonly nation: string | null;
  readonly region: string | null;
  readonly city: string | null;
  readonly address: string | null;
  readonly cap: string | null;
  readonly variazioneMq: string | null;
  readonly inizioConduzione: string | null;
  readonly fineConduzione: string | null;
}

/** Preview of an extracted production unit. */
export interface ProductionUnitPreview {
  readonly name: string;
  readonly cropName: string | null;
  readonly cropType: string | null;
  readonly variety: string | null;
  readonly protocoll: string | null;
  readonly protectionStructure: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly areaHa: number | null;
  readonly cycles?: readonly ProductionUnitCyclePreview[];
  readonly fieldAllocations: ReadonlyArray<{
    readonly fieldName?: string | null;
    readonly foglio: string | null;
    readonly particella: string | null;
    readonly sezione?: string | null;
    readonly subalterno?: string | null;
    readonly comune?: string | null;
    readonly codiceNazionale?: string | null;
    readonly areaHa: number | null;
    readonly fieldId?: string | null;
  }>;
}

export interface ProductionUnitCyclePreview {
  readonly cycleIndex: number;
  readonly cropName: string | null;
  readonly cropType: string | null;
  readonly cropCode?: string | null;
  readonly variety: string | null;
  readonly protocoll?: string | null;
  readonly protectionStructure: string | null;
  readonly startDate: string | null;
  readonly floweringDate?: string | null;
  readonly harvestingDate?: string | null;
  readonly endDate: string | null;
  readonly occupazione?: string | null;
  readonly destinazione?: string | null;
}

/** Shape of extractedData per category. */
export interface FieldsExtractionData {
  readonly fields: readonly FieldBulkPreview[];
  readonly extractedCount: number;
  readonly diagnostics?: unknown;
}

export interface ProductionUnitsExtractionData {
  readonly productionUnits: readonly ProductionUnitPreview[];
  readonly extractedCount: number;
  readonly diagnostics?: unknown;
}

export interface AgriculturalExtractionData {
  readonly fields: readonly FieldBulkPreview[];
  readonly productionUnits: readonly ProductionUnitPreview[];
  readonly extractedCount: number;
  readonly diagnostics?: unknown;
}

export interface InvoiceExtractionData {
  readonly entries: readonly InvoiceEntry[];
  readonly extractedCount: number;
}

export interface DdtExtractionData {
  readonly entries: readonly DdtEntry[];
  readonly extractedCount: number;
}

export interface StockExtractionData {
  readonly entries: readonly StockPreviewEntry[];
  readonly extractedCount: number;
}

export type ExtractionData =
  | FieldsExtractionData
  | ProductionUnitsExtractionData
  | AgriculturalExtractionData
  | InvoiceExtractionData
  | DdtExtractionData
  | StockExtractionData;

/** Single extraction record returned by the API. */
export interface FileExtractionResponse {
  readonly id: string;
  readonly batchId: string;
  readonly companyId: string;
  readonly status: FileExtractionStatus;
  readonly category: ResolvedCategory;
  readonly progress: number;
  readonly fileName: string;
  readonly fileIndex: number;
  readonly fileId: string | null;
  readonly fileUrl: string | null;
  readonly extractedData: ExtractionData | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Response for POST /extractions/batch (202). */
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

export type FileExtractionListSortBy = 'updatedAt' | 'fileName' | 'status' | 'category';
export type FileExtractionListSortOrder = 'asc' | 'desc';

export interface ListFileExtractionsQuery {
  readonly companyId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly includeGenerated?: boolean;
  readonly q?: string;
  readonly fileNames?: readonly string[];
  readonly status?: readonly FileExtractionStatus[];
  readonly category?: readonly ResolvedCategory[];
  readonly sortBy: FileExtractionListSortBy;
  readonly sortOrder: FileExtractionListSortOrder;
  readonly updatedAtFrom?: Date;
  readonly updatedAtTo?: Date;
}

export type ArchiveGeneratedType =
  | 'company'
  | 'fields'
  | 'production_units'
  | 'products'
  | 'job_group';

export interface ArchiveListItemResponse {
  readonly kind: 'extraction' | 'generated';
  readonly id: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly fileName: string;
  readonly updatedAt: string;
  readonly status: FileExtractionStatus | 'GENERATED';
  readonly category: ResolvedCategory | ArchiveGeneratedType;
  readonly fileUrl: string | null;
  /** Underlying File DB id when the row is backed by a stored file. Needed for bulk delete. */
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

export interface ListFileExtractionsResponse {
  readonly extractions: readonly FileExtractionResponse[];
  readonly total: number;
  readonly items?: readonly ArchiveListItemResponse[];
  readonly totalItems?: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CompanyExtractionCategorySummary {
  readonly companyId: string;
  readonly categories: readonly ResolvedCategory[];
}
