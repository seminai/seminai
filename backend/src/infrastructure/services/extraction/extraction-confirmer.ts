import { CompanyKind } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import {
  type IFileExtractionRepository,
  type FileExtractionRecord,
} from '../../../domain/repositories/IFileExtractionRepository';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../../../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import {
  CreateOrUpdateProductsAndStocksBulkUseCase,
  type ProductWithStockInput,
} from '../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import {
  type FieldsExtractionData,
  type ProductionUnitsExtractionData,
  type AgriculturalExtractionData,
  type InvoiceExtractionData,
  type StockExtractionData,
} from '../../../domain/dtos/file-extraction.dto';
import { type ConfirmExtractionRequestDTO } from '../../../domain/dtos/extraction-confirm-request.dto';
import { mapInvoiceEntriesToProducts } from './map-invoice-entries-to-products';
import { type LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { normalizeAreaHa } from '../../utils/area-normalization';
import { assertConfirmableInvoiceEntries } from './confirm-invoice-entries-validator';
import { resolveFieldConductionDates } from '../../utils/field-conduction-dates';
import { resolveFieldSauHa } from '../../utils/resolve-field-sau-ha';
import { resolvePuDateOrDefault } from '../../utils/production-unit-date-defaults';
import { reconcileInvoiceEntryPrice } from './reconcile-invoice-entry-price';

export interface ConfirmResult {
  readonly extractionId: string;
  readonly category: string;
  readonly status: 'CONFIRMED';
  readonly summary: Record<string, unknown>;
}

export class ExtractionConfirmer {
  constructor(
    private readonly fileExtractionRepository: IFileExtractionRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly bulkImportUseCase: BulkImportFieldsAndProductionUnitsUseCase,
    private readonly productStockUseCase: CreateOrUpdateProductsAndStocksBulkUseCase,
    private readonly logEditUseCase: LogFileExtractionEditUseCase | null = null,
  ) {}

  async confirm(
    extractionId: string,
    requestData?: ConfirmExtractionRequestDTO,
  ): Promise<ConfirmResult> {
    const extraction = await this.fileExtractionRepository.findById(extractionId);
    if (!extraction) {
      throw AppError.notFound('Extraction not found', 'EXTRACTION_NOT_FOUND');
    }
    if (extraction.status !== 'PENDING_CONFIRMATION') {
      throw AppError.badRequest(
        `Cannot confirm extraction with status ${extraction.status}`,
        'INVALID_EXTRACTION_STATUS',
      );
    }
    if (!extraction.extractedData) {
      throw AppError.badRequest('No extracted data to confirm', 'NO_EXTRACTED_DATA');
    }
    const summary = await this.dispatchConfirmation(extraction, requestData);
    await this.fileExtractionRepository.update(extractionId, { status: 'CONFIRMED' });
    return { extractionId, category: extraction.category, status: 'CONFIRMED', summary };
  }

  async confirmBatch(batchId: string): Promise<{
    confirmed: ConfirmResult[];
    skipped: number;
    errors: Array<{ extractionId: string; error: string }>;
  }> {
    const extractions = await this.fileExtractionRepository.findByBatchId(batchId);
    const pending = extractions.filter((e) => e.status === 'PENDING_CONFIRMATION');
    const skipped = extractions.length - pending.length;
    const confirmed: ConfirmResult[] = [];
    const errors: Array<{ extractionId: string; error: string }> = [];
    for (const extraction of pending) {
      try {
        const result = await this.confirm(extraction.id);
        confirmed.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Confirmation failed';
        errors.push({ extractionId: extraction.id, error: message });
      }
    }
    return { confirmed, skipped, errors };
  }

  private async resolveCompanyInfo(
    companyId: string,
  ): Promise<{ name: string; vatNumber: string }> {
    const company = await this.companyRepository.findById(companyId);
    if (!company) {
      throw AppError.notFound('Company not found for extraction', 'COMPANY_NOT_FOUND');
    }
    return { name: company.name, vatNumber: company.vatNumber };
  }

  private async dispatchConfirmation(
    extraction: FileExtractionRecord,
    requestData?: ConfirmExtractionRequestDTO,
  ): Promise<Record<string, unknown>> {
    const category = extraction.category;
    const data = extraction.extractedData;
    switch (category) {
      case 'fields':
        return this.confirmFields(extraction, data as FieldsExtractionData);
      case 'production_units':
        return this.confirmProductionUnits(extraction, data as ProductionUnitsExtractionData);
      case 'agricultural':
        return this.confirmAgricultural(extraction, data as AgriculturalExtractionData);
      case 'invoice':
      case 'ddt':
        return this.confirmInvoice(extraction, data as InvoiceExtractionData, requestData);
      case 'stock':
        return this.confirmStock(extraction, data as StockExtractionData);
      default:
        throw AppError.badRequest(`Unknown category: ${category}`, 'UNKNOWN_CATEGORY');
    }
  }

  private async confirmFields(
    extraction: FileExtractionRecord,
    data: FieldsExtractionData,
  ): Promise<Record<string, unknown>> {
    const company = await this.resolveCompanyInfo(extraction.companyId);
    const dto: BulkImportDTO = {
      userId: extraction.userId,
      companyName: company.name,
      vatNumber: company.vatNumber,
      fields: this.mapFieldPreviews(data.fields as unknown as Record<string, unknown>[]),
      productionUnits: [],
    };
    const result = await this.bulkImportUseCase.execute(dto);
    return { fieldsCreated: result.fieldCount };
  }

  private async confirmProductionUnits(
    extraction: FileExtractionRecord,
    data: ProductionUnitsExtractionData,
  ): Promise<Record<string, unknown>> {
    const company = await this.resolveCompanyInfo(extraction.companyId);
    const dto: BulkImportDTO = {
      userId: extraction.userId,
      companyName: company.name,
      vatNumber: company.vatNumber,
      fields: [],
      productionUnits: this.mapPuPreviews(
        data.productionUnits as unknown as Record<string, unknown>[],
      ),
    };
    const result = await this.bulkImportUseCase.execute(dto);
    return { productionUnitsCreated: result.productionUnitCount };
  }

  private async confirmAgricultural(
    extraction: FileExtractionRecord,
    data: AgriculturalExtractionData,
  ): Promise<Record<string, unknown>> {
    const company = await this.resolveCompanyInfo(extraction.companyId);
    const dto: BulkImportDTO = {
      userId: extraction.userId,
      companyName: company.name,
      vatNumber: company.vatNumber,
      fields: this.mapFieldPreviews(data.fields as unknown as Record<string, unknown>[]),
      productionUnits: this.mapPuPreviews(
        data.productionUnits as unknown as Record<string, unknown>[],
      ),
    };
    const result = await this.bulkImportUseCase.execute(dto);
    return {
      fieldsCreated: result.fieldCount,
      productionUnitsCreated: result.productionUnitCount,
    };
  }

  private async confirmInvoice(
    extraction: FileExtractionRecord,
    data: InvoiceExtractionData,
    requestData?: ConfirmExtractionRequestDTO,
  ): Promise<Record<string, unknown>> {
    const requestedEntries = requestData?.invoiceEntries ?? data.entries;
    const reconciledEntries = requestedEntries.map(reconcileInvoiceEntryPrice);
    const acceptedEntries = reconciledEntries.filter((entry) => entry.accepted !== false);
    if (acceptedEntries.length === 0) {
      throw AppError.badRequest(
        'At least one accepted invoice row is required',
        'NO_ACCEPTED_INVOICE_ROWS',
      );
    }
    const company = await this.companyRepository.findById(extraction.companyId);
    const companyKind = company?.kind ?? CompanyKind.AGRICULTURAL;
    assertConfirmableInvoiceEntries({
      entries: acceptedEntries,
      allowReviewOverride: requestData?.allowReviewOverride ?? false,
      companyKind,
    });
    if (this.logEditUseCase && (requestData?.invoiceEntries || requestData?.allowReviewOverride)) {
      await this.logEditUseCase.execute({
        extractionId: extraction.id,
        source: 'CONFIRM_OVERRIDE',
        before: { entries: data.entries },
        after: {
          entries: reconciledEntries,
          allowReviewOverride: requestData.allowReviewOverride ?? false,
        },
        userId: requestData.actorUserId ?? extraction.userId,
      });
    }
    const products = mapInvoiceEntriesToProducts({
      entries: acceptedEntries,
      fileId: extraction.fileId,
      extractionId: extraction.id,
      isDdtCategory: extraction.category === 'ddt',
      companyKind,
    });
    const result = await this.productStockUseCase.execute({
      companyId: extraction.companyId,
      warehouseId: requestData?.warehouseId,
      products,
    });
    await this.fileExtractionRepository.update(extraction.id, {
      extractedData: {
        ...data,
        entries: reconciledEntries,
      } as InvoiceExtractionData,
    });
    return {
      productsCreated: result.productsCreated,
      productsUpdated: result.productsUpdated,
      stocksCreated: result.stocksCreated,
    };
  }

  private async confirmStock(
    extraction: FileExtractionRecord,
    data: StockExtractionData,
  ): Promise<Record<string, unknown>> {
    const products: ProductWithStockInput[] = data.entries.map((entry) => ({
      name: entry.name,
      category: entry.category as 'FERTILIZER' | 'PESTICIDE' | 'SEED' | 'HARVEST',
      registrationNumber: entry.registrationNumber ?? undefined,
      stock: {
        sourceFileId: extraction.fileId ?? undefined,
        sourceExtractionId: extraction.id,
        quantity: entry.stock.quantity,
        unitOfMeasureQuantity: entry.stock.unitOfMeasureQuantity,
        price: entry.stock.price,
        type: entry.stock.type,
        ddtCode: entry.stock.ddtCode,
        ddtDate: entry.stock.ddtDate,
        invoiceCode: entry.stock.invoiceCode ?? undefined,
        companySupplierName: entry.stock.companySupplierName ?? undefined,
      },
    }));
    const result = await this.productStockUseCase.execute({
      companyId: extraction.companyId,
      products,
    });
    return {
      productsCreated: result.productsCreated,
      stocksCreated: result.stocksCreated,
    };
  }

  private mapFieldPreviews(fields: readonly Record<string, unknown>[]): BulkImportDTO['fields'] {
    return fields.map((f) => {
      const superficieCatastaleMq = f.superficieCatastaleMq as number | undefined;
      const gisHa = f.gisHa as number | undefined;
      const { inizioConduzione, fineConduzione } = resolveFieldConductionDates(
        f.inizioConduzione as string | undefined,
        f.fineConduzione as string | undefined,
      );
      return {
        name: (f.name as string) ?? 'Unnamed field',
        coordinates: (f.coordinates as number[]) ?? [],
        latitude: f.latitude as number | undefined,
        longitude: f.longitude as number | undefined,
        polygon: f.polygon,
        gisHa,
        sauHa:
          resolveFieldSauHa(f.sauHa as number | undefined, gisHa, superficieCatastaleMq) ??
          undefined,
        soilType: f.soilType as string | undefined,
        uso: f.uso as string | undefined,
        qualita: f.qualita as string | undefined,
        superficieCatastaleMq,
        sezione: f.sezione as string | undefined,
        foglio: f.foglio as string | undefined,
        particella: f.particella as string | undefined,
        subalterno: f.subalterno as string | undefined,
        nation: f.nation as string | undefined,
        region: f.region as string | undefined,
        city: f.city as string | undefined,
        address: f.address as string | undefined,
        cap: f.cap as string | undefined,
        variazioneMq: f.variazioneMq as string | undefined,
        inizioConduzione,
        fineConduzione,
      };
    });
  }

  private mapPuPreviews(
    units: readonly Record<string, unknown>[],
  ): BulkImportDTO['productionUnits'] {
    return units.map((u) => {
      const cycle = ((u.cycles as Array<Record<string, unknown>>) ?? [])[0];
      const cycles = ((u.cycles as Array<Record<string, unknown>>) ?? []).map((entry, index) => ({
        cycleIndex: this.resolveCycleIndex(entry.cycleIndex, index),
        cropName: ((entry.cropName as string) || (u.cropName as string) || 'N/A') as string,
        cropType: ((entry.cropType as string) || (u.cropType as string) || 'N/A') as string,
        variety: ((entry.variety as string) || (u.variety as string) || 'N/A') as string,
        protocoll: ((entry.protocoll as string) ||
          (entry.cropCode as string) ||
          (u.protocoll as string) ||
          'N/A') as string,
        protectionStructure: ((entry.protectionStructure as string) ||
          (u.protectionStructure as string) ||
          'N/A') as string,
        floweringDate: this.resolveOptionalPuDate(entry.floweringDate),
        harvestingDate: this.resolveOptionalPuDate(entry.harvestingDate),
        occupazione:
          (entry.occupazione as string | undefined) ?? (u.occupazione as string | undefined),
        destinazioneDiUso:
          (entry.destinazioneDiUso as string | undefined) ??
          (entry.destinazione as string | undefined) ??
          (u.destinazioneDiUso as string | undefined),
        acquaTotalePeridoL: (entry.acquaTotalePeridoL as number | undefined) ?? 0,
        seasonYear: this.resolveSeasonYear(entry.startDate ?? u.startDate),
      }));
      const allocations = (u.allocations ?? u.fieldAllocations) as
        | Array<Record<string, unknown>>
        | undefined;
      const mappedAllocations = (allocations ?? []).map((a) => ({
        fieldId: a.fieldId as string | undefined,
        fieldName: (a.fieldName as string) || 'N/A',
        comune: a.comune as string | undefined,
        codiceNazionale: a.codiceNazionale as string | undefined,
        sezione: a.sezione as string | undefined,
        foglio: a.foglio as string | undefined,
        particella: a.particella as string | undefined,
        subalterno: a.subalterno as string | undefined,
        areaHa: normalizeAreaHa(a.areaHa) ?? 0,
      }));
      return {
        name: (u.name as string) || 'Unnamed PU',
        cropName: (u.cropName as string) || 'N/A',
        cropType: (u.cropType as string) || 'N/A',
        variety: (u.variety as string) || 'N/A',
        protocoll: (u.protocoll as string) || 'N/A',
        protectionStructure: (u.protectionStructure as string) || 'N/A',
        startDate: resolvePuDateOrDefault(cycle?.startDate ?? u.startDate, 'start'),
        floweringDate: resolvePuDateOrDefault(cycle?.floweringDate ?? u.startDate, 'start'),
        harvestingDate: resolvePuDateOrDefault(cycle?.harvestingDate ?? u.endDate, 'end'),
        endDate: resolvePuDateOrDefault(cycle?.endDate ?? u.endDate, 'end'),
        fieldAllocations:
          mappedAllocations.length > 0
            ? mappedAllocations
            : [{ fieldName: (u.name as string) || 'N/A', areaHa: normalizeAreaHa(u.areaHa) ?? 0 }],
        cycles: cycles.length > 0 ? cycles : undefined,
      };
    });
  }

  private resolvePuDate(value: unknown): Date {
    if (!value) return new Date();
    if (typeof value === 'string') return new Date(value);
    if (value instanceof Date) return value;
    return new Date();
  }

  private resolveOptionalPuDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return new Date(value);
    if (value instanceof Date) return value;
    return undefined;
  }

  private resolveCycleIndex(value: unknown, index: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : index + 1;
  }

  private resolveSeasonYear(value: unknown): number {
    const date = this.resolvePuDate(value);
    return date.getUTCFullYear();
  }
}
