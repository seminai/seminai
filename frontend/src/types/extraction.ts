import type { FileExtractionStatus } from '@/types/prisma';
import type { InvoiceProductCategory } from '@/lib/extraction-product-category';

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

export type {
  AgriculturalInvoiceCategory,
  InvoiceProductCategory,
} from '@/lib/extraction-product-category';

/**
 * Canonical unit-of-measure whitelist. Mirrors the BE single source of truth at
 * `seminai-be-v2/src/domain/dtos/canonical-units.dto.ts` — keep both in sync.
 */
export const CANONICAL_UNITS = [
  'KG',
  'G',
  'T',
  'Q',
  'L',
  'LT',
  'ML',
  'NR',
  'PZ',
  'CF',
  'SC',
  'CT',
  'CN',
] as const;

export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];

/** Destinations produced by the BE canonical-quantity conversion pipeline. */
export const CONVERTED_UNITS = ['KG', 'L', 'PZ'] as const;
export type ConvertedUnit = (typeof CONVERTED_UNITS)[number];

// --- Extraction data shapes per category ---

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

export interface ProductionUnitAllocationPreview {
  readonly foglio?: string | null;
  readonly particella?: string | null;
  readonly sezione?: string | null;
  readonly subalterno?: string | null;
  readonly comune?: string | null;
  readonly codiceNazionale?: string | null;
  readonly areaHa: number | null;
  readonly fieldId?: string | null;
  readonly fieldName?: string | null;
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
  readonly cycles?: ReadonlyArray<ProductionUnitCyclePreview>;
  // The BE emits this preview with the canonical key `allocations`
  // (see production-unit-normalizer.ts). `fieldAllocations` is kept for tolerance.
  readonly allocations?: ReadonlyArray<ProductionUnitAllocationPreview>;
  readonly fieldAllocations?: ReadonlyArray<ProductionUnitAllocationPreview>;
}

export interface InvoiceEntry {
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly productCategory: InvoiceProductCategory;
  readonly administrativeStatus: string | null;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly quantityConverted?: number | null;
  readonly unitMeasureConverted?: string | null;
  readonly accepted?: boolean;
  readonly supplierName: string | null;
  readonly supplierVat: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string | null;
  readonly invoiceDueDate: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
}

export interface DdtEntry {
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly productCategory: InvoiceProductCategory;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly quantityConverted?: number | null;
  readonly unitMeasureConverted?: string | null;
  readonly accepted?: boolean;
  readonly supplierName: string | null;
  readonly supplierVat: string | null;
  readonly ddtDate: string | null;
  readonly orderNumber: string | null;
  readonly unitPrice?: number | null;
  readonly totalPrice?: number | null;
  readonly needsReview?: boolean;
  readonly reviewReasons?: readonly string[];
  readonly sourceRowIndex?: number;
  readonly productCode?: string | null;
  readonly rawLine?: string;
  readonly sourceChannel?: 'llm-primary' | 'deterministic-fallback' | 'xml';
}

export type ConfirmableStockEntry = InvoiceEntry | DdtEntry;

export interface StockPreviewEntry {
  readonly name: string;
  readonly category: string;
  readonly registrationNumber: string | null;
  readonly stock: {
    readonly quantity: number;
    readonly unitOfMeasureQuantity: string;
    readonly price: number;
    readonly type: 'IN' | 'OUT';
    readonly ddtCode: string;
    readonly ddtDate: string;
    readonly invoiceCode: string | null;
    readonly companySupplierName: string | null;
  };
}

// --- Extraction data unions ---

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

// --- API response types ---

export interface FileExtractionResponse {
  readonly id: string;
  readonly batchId: string;
  readonly status: FileExtractionStatus;
  readonly category: ResolvedCategory;
  readonly progress: number;
  readonly fileName: string;
  readonly fileIndex: number;
  readonly fileId: string | null;
  readonly fileUrl: string | null;
  readonly extractedData: ExtractionData | null;
  readonly error: string | null;
  readonly companyId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type FileExtractionListSortBy = 'updatedAt' | 'fileName' | 'status' | 'category';
export type FileExtractionListSortOrder = 'asc' | 'desc';

export interface FileExtractionListQuery {
  readonly companyId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly includeGenerated?: boolean;
  readonly q?: string;
  readonly fileNames?: readonly string[];
  readonly status?: readonly FileExtractionStatus[];
  readonly category?: readonly ResolvedCategory[];
  readonly sortBy?: FileExtractionListSortBy;
  readonly sortOrder?: FileExtractionListSortOrder;
  readonly updatedAtFrom?: string;
  readonly updatedAtTo?: string;
}

export type ArchiveGeneratedType = 'company' | 'fields' | 'production_units' | 'products' | 'job_group';

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

// --- Socket.IO event payloads ---

export interface ExtractionProgressEvent {
  readonly extractionId: string;
  readonly batchId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly progress: number;
}

export interface ExtractionCompletedEvent {
  readonly extractionId: string;
  readonly batchId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly category: ResolvedCategory;
  readonly status: 'PENDING_CONFIRMATION';
}

export interface ExtractionErrorEvent {
  readonly extractionId: string;
  readonly batchId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly error: string;
}

export interface ExtractionDoneEvent {
  readonly batchId: string;
}

// --- Archive row types ---

export type EntityType = 'fields' | 'production-units' | 'products' | 'company' | 'jobs' | 'field-notes';

export interface ExtractionArchiveRow {
  readonly id: string;
  readonly titolo: string;
  readonly azienda: string;
  readonly aggiornato: string;
  readonly aggiornatoIso: string;
  readonly status: string;
  readonly tipoDiFile: string;
  readonly formato: string;
  readonly note: string;
  readonly kind: 'extraction';
  readonly extractionId: string;
  readonly batchId: string;
  readonly progress: number;
  readonly fileUrl: string | null;
  readonly fileId: string | null;
  readonly companyId: string;
  readonly category: ResolvedCategory;
}

export interface EntityArchiveRow {
  readonly id: string;
  readonly titolo: string;
  readonly azienda: string;
  readonly aggiornato: string;
  readonly aggiornatoIso: string;
  readonly status: string;
  readonly tipoDiFile: string;
  readonly formato: string;
  readonly note: string;
  readonly kind: 'entity';
  readonly entityType: EntityType;
  readonly companyId: string;
  readonly jobId?: string;
  readonly totalOperations?: number;
  readonly verifiedOperations?: number;
  readonly pendingOperations?: number;
}

export interface DosageJobArchiveRow {
  readonly id: string;
  readonly titolo: string;
  readonly azienda: string;
  readonly aggiornato: string;
  readonly aggiornatoIso: string;
  readonly status: string;
  readonly tipoDiFile: string;
  readonly formato: string;
  readonly note: string;
  readonly kind: 'dosage-job';
  readonly jobId: string;
  readonly progress: number;
  readonly state: string;
}

export type ArchiveRow = ExtractionArchiveRow | EntityArchiveRow | DosageJobArchiveRow;
