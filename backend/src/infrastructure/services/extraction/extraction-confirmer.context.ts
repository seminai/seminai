import { type IFileExtractionRepository, type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../../../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { CreateOrUpdateProductsAndStocksBulkUseCase } from '../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { type FieldsExtractionData, type ProductionUnitsExtractionData, type AgriculturalExtractionData, type InvoiceExtractionData, type StockExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { type ConfirmExtractionRequestDTO } from '../../../domain/dtos/extraction-confirm-request.dto';
import { type LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { ConfirmResult } from './extraction-confirmer.support';

export interface ExtractionConfirmerContext {
  readonly fileExtractionRepository: IFileExtractionRepository;
  readonly companyRepository: ICompanyRepository;
  readonly bulkImportUseCase: BulkImportFieldsAndProductionUnitsUseCase;
  readonly productStockUseCase: CreateOrUpdateProductsAndStocksBulkUseCase;
  readonly logEditUseCase: LogFileExtractionEditUseCase | null;
  confirm(extractionId: string, requestData?: ConfirmExtractionRequestDTO): Promise<ConfirmResult>;
  confirmBatch(batchId: string): Promise<{
    confirmed: ConfirmResult[];
    skipped: number;
    errors: Array<{ extractionId: string; error: string }>;
  }>;
  resolveCompanyInfo(companyId: string): Promise<{ name: string; vatNumber: string }>;
  dispatchConfirmation(extraction: FileExtractionRecord, requestData?: ConfirmExtractionRequestDTO): Promise<Record<string, unknown>>;
  confirmFields(extraction: FileExtractionRecord, data: FieldsExtractionData): Promise<Record<string, unknown>>;
  confirmProductionUnits(extraction: FileExtractionRecord, data: ProductionUnitsExtractionData): Promise<Record<string, unknown>>;
  confirmAgricultural(extraction: FileExtractionRecord, data: AgriculturalExtractionData): Promise<Record<string, unknown>>;
  confirmInvoice(extraction: FileExtractionRecord, data: InvoiceExtractionData, requestData?: ConfirmExtractionRequestDTO): Promise<Record<string, unknown>>;
  confirmStock(extraction: FileExtractionRecord, data: StockExtractionData): Promise<Record<string, unknown>>;
  mapFieldPreviews(fields: readonly Record<string, unknown>[]): BulkImportDTO['fields'];
  mapPuPreviews(units: readonly Record<string, unknown>[]): BulkImportDTO['productionUnits'];
  resolvePuDate(value: unknown): Date;
  resolveOptionalPuDate(value: unknown): Date | undefined;
  resolveCycleIndex(value: unknown, index: number): number;
  resolveSeasonYear(value: unknown): number;
}
