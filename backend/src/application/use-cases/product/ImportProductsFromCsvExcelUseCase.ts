import { ProductCategory } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { Product } from '../../../domain/entities/Product';
import { Stock } from '../../../domain/entities/Stock';
import type { IProductRepository } from '../../../domain/repositories/IProductRepository';
import type { IStockRepository } from '../../../domain/repositories/IStockRepository';
import type { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { parseDate } from '../../../infrastructure/utils/date.util';
import { convertQuantityToCanonicalUnit } from '../../../infrastructure/utils/quantityConversion';
import { normalizeDdtCode } from '../../../infrastructure/utils/stock.util';
import { FitosanitariLookupService } from '../../../infrastructure/services/utils/FitosanitariLookupService';
import { ProductRegistrationLookupService } from '../../../infrastructure/services/utils/ProductRegistrationLookup';
import { mapToProductCategory } from './product-category.mapper';
import { ProductImportFileParser } from './ProductImportFileParser';
import type {
  CsvExcelRow,
  ImportProductsFromCsvExcelDTO,
  ImportResult,
} from './product-import.types';
import { assertWarehouseCompany, resolveProductImportWarehouse } from './product-import-warehouse';

export type {
  ImportProductsFromCsvExcelDTO,
  ImportResult,
  ProductImportPreview,
} from './product-import.types';

interface RowContext {
  readonly rowNumber: number;
  readonly warehouseId: string;
  readonly sourceFileId?: string;
  readonly preview: boolean;
  readonly result: ImportResult;
}

interface DocumentContext {
  readonly isInitialStock: boolean;
  readonly rawDeliveryNoteDate: string;
  readonly deliveryNoteDate: Date;
  readonly invoiceDate: Date | null;
  readonly invoiceDueDate: Date | null;
}

export class ImportProductsFromCsvExcelUseCase {
  private readonly fileParser = new ProductImportFileParser();
  private readonly registrationLookup = new ProductRegistrationLookupService();
  private readonly fitosanitari = FitosanitariLookupService.getInstance();

  constructor(
    private readonly productRepository: IProductRepository,
    private readonly stockRepository: IStockRepository,
    private readonly warehouseRepository: IWarehouseRepository,
  ) {}

  async execute(data: ImportProductsFromCsvExcelDTO): Promise<ImportResult> {
    const { companyId, warehouseId, sourceFileId, fileBuffer, fileName, preview = false } = data;
    if (!companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY_ID');
    if (preview && warehouseId) {
      await assertWarehouseCompany(this.warehouseRepository, companyId, warehouseId);
    }
    const resolvedWarehouseId = preview
      ? null
      : await resolveProductImportWarehouse(this.warehouseRepository, companyId, warehouseId);
    if (!preview && !resolvedWarehouseId) {
      throw AppError.internal('Warehouse resolution failed', 'WAREHOUSE_RESOLUTION_FAILED');
    }
    const rows = await this.fileParser.parse(fileBuffer, fileName);
    const result: ImportResult = {
      productsCreated: 0,
      productsUpdated: 0,
      stocksCreated: 0,
      errors: [],
      productIds: [],
      previewProducts: preview ? [] : undefined,
    };
    for (let index = 0; index < rows.length; index += 1) {
      try {
        await this.processRow(rows[index], {
          rowNumber: index + 1,
          warehouseId: resolvedWarehouseId ?? '',
          sourceFileId,
          preview,
          result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Row ${index + 1}: ${message}`);
      }
    }
    return result;
  }

  private async processRow(row: CsvExcelRow, context: RowContext): Promise<void> {
    if (!row.productName?.trim() || this.isEmbeddedHeader(row.productName)) return;
    if (typeof row.quantity !== 'number' || Number.isNaN(row.quantity) || row.quantity < 0) {
      context.result.errors.push(
        `Row ${context.rowNumber}: quantity must be a valid non-negative number`,
      );
      return;
    }
    if (!row.unitOfMeasureQuantity?.trim()) {
      context.result.errors.push(`Row ${context.rowNumber}: unitOfMeasureQuantity is required`);
      return;
    }
    const document = this.resolveDocumentContext(row, context.rowNumber, context.result);
    if (!document) return;
    const productName = row.productName.trim();
    const movementType = row.type ?? 'IN';
    const signedQuantity = movementType === 'OUT' ? -Math.abs(row.quantity) : row.quantity;
    let registrationNumber = row.registrationNumber?.trim() ?? null;
    let category = mapToProductCategory(row.category, registrationNumber);
    if (!registrationNumber && category !== ProductCategory.PESTICIDE) {
      const match = this.registrationLookup.findProduct(productName);
      if (match) {
        registrationNumber = match.registrationNumber;
        category = ProductCategory.PESTICIDE;
      }
    }
    const administrativeStatus =
      category === ProductCategory.PESTICIDE
        ? this.fitosanitari.lookupStatus(registrationNumber, productName)
        : null;
    const deliveryNoteCode =
      row.ddtCode?.trim() ||
      row.invoiceCode?.trim() ||
      (document.isInitialStock
        ? `GIACENZA ${document.rawDeliveryNoteDate || new Date().getFullYear()}`
        : '');

    if (context.preview) {
      context.result.previewProducts?.push({
        name: productName,
        sku: row.sku?.trim() || undefined,
        barcode: null,
        category,
        type: 'Generico',
        description: null,
        registrationNumber,
        stock: {
          quantity: signedQuantity,
          unitOfMeasureQuantity: row.unitOfMeasureQuantity.trim(),
          price: row.price ?? 0,
          unitOfMeasurePrice: row.unitOfMeasurePrice?.trim() || 'EUR',
          type: movementType,
          ddtCode: deliveryNoteCode,
          ddtDate: document.deliveryNoteDate.toISOString(),
          invoiceCode: row.invoiceCode?.trim() || null,
          invoiceDate: document.invoiceDate?.toISOString() ?? null,
          invoiceDueDate: document.invoiceDueDate?.toISOString() ?? null,
          companySupplierName: row.supplierName?.trim() || null,
          addressSupplier: null,
          vatNumberSupplier: null,
        },
      });
      return;
    }
    const productId = await this.resolveProduct({
      row,
      productName,
      registrationNumber,
      category,
      administrativeStatus,
      context,
    });
    const canonical = convertQuantityToCanonicalUnit(
      row.quantity,
      row.unitOfMeasureQuantity.trim(),
    );
    await this.stockRepository.create(
      Stock.create({
        productId,
        sourceFileId: context.sourceFileId ?? null,
        jobId: null,
        quantity: signedQuantity,
        unitOfMeasureQuantity: row.unitOfMeasureQuantity.trim(),
        price: row.price ?? 0,
        unitOfMeasurePrice: row.unitOfMeasurePrice?.trim() || 'EUR',
        type: movementType,
        ddtCode: normalizeDdtCode(deliveryNoteCode),
        ddtDate: document.deliveryNoteDate,
        ddtUrlFile: null,
        invoiceCode: row.invoiceCode?.trim() || null,
        invoiceDate: document.invoiceDate,
        invoiceDueDate: document.invoiceDueDate,
        invoiceUrlFile: null,
        companySupplierName: row.supplierName?.trim() || null,
        addressSupplier: null,
        vatNumberSupplier: null,
        productNameAsOnDocument: row.productName.trim(),
        quantityConverted: canonical?.quantityConverted ?? null,
        unitMeasureConverted: canonical?.unitMeasureConverted ?? null,
      }),
    );
    context.result.stocksCreated += 1;
  }

  private async resolveProduct(input: {
    readonly row: CsvExcelRow;
    readonly productName: string;
    readonly registrationNumber: string | null;
    readonly category: ProductCategory;
    readonly administrativeStatus: string | null;
    readonly context: RowContext;
  }): Promise<string> {
    const existing = await this.productRepository.findByNameAndWarehouseId(
      input.productName,
      input.context.warehouseId,
    );
    if (existing) {
      input.context.result.productsUpdated += 1;
      if (!input.context.result.productIds.includes(existing.id)) {
        input.context.result.productIds.push(existing.id);
      }
      return existing.id;
    }
    const created = await this.productRepository.create(
      Product.create({
        warehouseId: input.context.warehouseId,
        name: input.productName,
        sku: input.row.sku?.trim() ?? '',
        barcode: null,
        category: input.category,
        type: 'Generico',
        description: null,
        administrativeStatus: input.administrativeStatus,
        registrationNumber: input.registrationNumber,
        labelUrl: null,
        labelMetadata: null,
      }),
    );
    input.context.result.productsCreated += 1;
    input.context.result.productIds.push(created.id);
    return created.id;
  }

  private resolveDocumentContext(
    row: CsvExcelRow,
    rowNumber: number,
    result: ImportResult,
  ): DocumentContext | null {
    const rawDeliveryNoteDate = row.ddtDate?.trim() ?? '';
    const isYearOnlyStock =
      /^\d{4}$/.test(rawDeliveryNoteDate) && Number(rawDeliveryNoteDate) < 2100;
    const hasDdtCode = Boolean(row.ddtCode?.trim());
    const hasInvoiceCode = Boolean(row.invoiceCode?.trim());
    const hasDdtDate = Boolean(row.ddtDate?.trim());
    const hasInvoiceDate = Boolean(row.invoiceDate?.trim());
    const isInitialStock =
      isYearOnlyStock || (!hasDdtCode && !hasInvoiceCode && !hasDdtDate && !hasInvoiceDate);
    if (!hasDdtCode && !hasInvoiceCode && !isInitialStock) {
      result.errors.push(`Row ${rowNumber}: ddtCode or invoiceCode is required`);
      return null;
    }
    if (!hasDdtDate && !hasInvoiceDate && !isInitialStock) {
      result.errors.push(`Row ${rowNumber}: ddtDate or invoiceDate is required`);
      return null;
    }
    const invoiceDate = parseDate(row.invoiceDate);
    let deliveryNoteDate = parseDate(row.ddtDate) ?? invoiceDate;
    if (!deliveryNoteDate && isInitialStock) {
      const year = isYearOnlyStock ? Number(rawDeliveryNoteDate) : new Date().getFullYear();
      deliveryNoteDate = new Date(year, 0, 1);
    }
    if (!deliveryNoteDate) {
      result.errors.push(
        `Row ${rowNumber}: date "${row.ddtDate || row.invoiceDate}" could not be parsed`,
      );
      return null;
    }
    return {
      isInitialStock,
      rawDeliveryNoteDate,
      deliveryNoteDate,
      invoiceDate,
      invoiceDueDate: parseDate(row.invoiceDueDate),
    };
  }

  private isEmbeddedHeader(name: string): boolean {
    const upper = name.trim().toUpperCase();
    return (
      upper.includes('NOME PRODOTTO') ||
      upper.includes('FITOSANITARIO') ||
      upper.includes('FORMULATO COMMERCIALE') ||
      upper.includes('SCHEDA MAGAZZIN') ||
      /^PAG\s+\d+$/i.test(upper)
    );
  }
}
