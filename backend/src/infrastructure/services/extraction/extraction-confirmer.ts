import { type IFileExtractionRepository, type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../../../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { CreateOrUpdateProductsAndStocksBulkUseCase } from '../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { type FieldsExtractionData, type ProductionUnitsExtractionData, type AgriculturalExtractionData, type InvoiceExtractionData, type StockExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { type ConfirmExtractionRequestDTO } from '../../../domain/dtos/extraction-confirm-request.dto';
import { type LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { ConfirmResult } from './extraction-confirmer.support';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';
import { extractionConfirmerConfirm } from './extraction-confirmer.01-confirm';
import { extractionConfirmerConfirmBatch } from './extraction-confirmer.02-confirm-batch';
import { extractionConfirmerResolveCompanyInfo } from './extraction-confirmer.03-resolve-company-info';
import { extractionConfirmerDispatchConfirmation } from './extraction-confirmer.04-dispatch-confirmation';
import { extractionConfirmerConfirmFields } from './extraction-confirmer.05-confirm-fields';
import { extractionConfirmerConfirmProductionUnits } from './extraction-confirmer.06-confirm-production-units';
import { extractionConfirmerConfirmAgricultural } from './extraction-confirmer.07-confirm-agricultural';
import { extractionConfirmerConfirmInvoice } from './extraction-confirmer.08-confirm-invoice';
import { extractionConfirmerConfirmStock } from './extraction-confirmer.09-confirm-stock';
import { extractionConfirmerMapFieldPreviews } from './extraction-confirmer.10-map-field-previews';
import { extractionConfirmerMapPuPreviews } from './extraction-confirmer.11-map-pu-previews';
import { extractionConfirmerResolvePuDate } from './extraction-confirmer.12-resolve-pu-date';
import { extractionConfirmerResolveOptionalPuDate } from './extraction-confirmer.13-resolve-optional-pu-date';
import { extractionConfirmerResolveCycleIndex } from './extraction-confirmer.14-resolve-cycle-index';
import { extractionConfirmerResolveSeasonYear } from './extraction-confirmer.15-resolve-season-year';

export { type ConfirmResult } from './extraction-confirmer.support';

export class ExtractionConfirmer {

  constructor(
    readonly fileExtractionRepository: IFileExtractionRepository,
    readonly companyRepository: ICompanyRepository,
    readonly bulkImportUseCase: BulkImportFieldsAndProductionUnitsUseCase,
    readonly productStockUseCase: CreateOrUpdateProductsAndStocksBulkUseCase,
    readonly logEditUseCase: LogFileExtractionEditUseCase | null = null,
  ) {}

  async confirm(
    extractionId: string,
    requestData?: ConfirmExtractionRequestDTO,
  ): Promise<ConfirmResult> {
    return extractionConfirmerConfirm.call(this as unknown as ExtractionConfirmerContext, extractionId, requestData);
  }

  async confirmBatch(batchId: string): Promise<{
    confirmed: ConfirmResult[];
    skipped: number;
    errors: Array<{ extractionId: string; error: string }>;
  }> {
    return extractionConfirmerConfirmBatch.call(this as unknown as ExtractionConfirmerContext, batchId);
  }

  async resolveCompanyInfo(
    companyId: string,
  ): Promise<{ name: string; vatNumber: string }> {
    return extractionConfirmerResolveCompanyInfo.call(this as unknown as ExtractionConfirmerContext, companyId);
  }

  async dispatchConfirmation(
    extraction: FileExtractionRecord,
    requestData?: ConfirmExtractionRequestDTO,
  ): Promise<Record<string, unknown>> {
    return extractionConfirmerDispatchConfirmation.call(this as unknown as ExtractionConfirmerContext, extraction, requestData);
  }

  async confirmFields(
    extraction: FileExtractionRecord,
    data: FieldsExtractionData,
  ): Promise<Record<string, unknown>> {
    return extractionConfirmerConfirmFields.call(this as unknown as ExtractionConfirmerContext, extraction, data);
  }

  async confirmProductionUnits(
    extraction: FileExtractionRecord,
    data: ProductionUnitsExtractionData,
  ): Promise<Record<string, unknown>> {
    return extractionConfirmerConfirmProductionUnits.call(this as unknown as ExtractionConfirmerContext, extraction, data);
  }

  async confirmAgricultural(
    extraction: FileExtractionRecord,
    data: AgriculturalExtractionData,
  ): Promise<Record<string, unknown>> {
    return extractionConfirmerConfirmAgricultural.call(this as unknown as ExtractionConfirmerContext, extraction, data);
  }

  async confirmInvoice(
    extraction: FileExtractionRecord,
    data: InvoiceExtractionData,
    requestData?: ConfirmExtractionRequestDTO,
  ): Promise<Record<string, unknown>> {
    return extractionConfirmerConfirmInvoice.call(this as unknown as ExtractionConfirmerContext, extraction, data, requestData);
  }

  async confirmStock(
    extraction: FileExtractionRecord,
    data: StockExtractionData,
  ): Promise<Record<string, unknown>> {
    return extractionConfirmerConfirmStock.call(this as unknown as ExtractionConfirmerContext, extraction, data);
  }

  mapFieldPreviews(fields: readonly Record<string, unknown>[]): BulkImportDTO['fields'] {
    return extractionConfirmerMapFieldPreviews.call(this as unknown as ExtractionConfirmerContext, fields);
  }

  mapPuPreviews(
    units: readonly Record<string, unknown>[],
  ): BulkImportDTO['productionUnits'] {
    return extractionConfirmerMapPuPreviews.call(this as unknown as ExtractionConfirmerContext, units);
  }

  resolvePuDate(value: unknown): Date {
    return extractionConfirmerResolvePuDate.call(this as unknown as ExtractionConfirmerContext, value);
  }

  resolveOptionalPuDate(value: unknown): Date | undefined {
    return extractionConfirmerResolveOptionalPuDate.call(this as unknown as ExtractionConfirmerContext, value);
  }

  resolveCycleIndex(value: unknown, index: number): number {
    return extractionConfirmerResolveCycleIndex.call(this as unknown as ExtractionConfirmerContext, value, index);
  }

  resolveSeasonYear(value: unknown): number {
    return extractionConfirmerResolveSeasonYear.call(this as unknown as ExtractionConfirmerContext, value);
  }
}
