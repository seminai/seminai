import { Prisma, ProductCategory, Stock as PrismaStock } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { Product } from '../../../domain/entities/Product';
import { Stock } from '../../../domain/entities/Stock';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { parseDate } from '../../../infrastructure/utils/date.util';
import { FitosanitariLookupService } from '../../../infrastructure/services/utils/FitosanitariLookupService';
import { mapToProductCategory } from './product-category.mapper';
import {
  validateStockFields,
  normalizeDdtCode,
  defaultUnitOfMeasurePrice,
} from '../../../infrastructure/utils/stock.util';

export interface CreateProductDTO {
  warehouseId: string;
  name: string;
  sku?: string | null;
  category?: Prisma.ProductCreateInput['category'] | null;
  type?: string | null;
  barcode?: string | null;
  description?: string | null;
  registrationNumber?: string | null;
  labelUrl?: string | null;
  labelMetadata?: unknown | null;
  vintage?: number | null;
  unitPrice?: number | null;
  vatRate?: number | null;
  unitOfMeasure?: string | null;
  isActive?: boolean;
  stock?:
    | (Partial<Omit<PrismaStock, 'id' | 'productId' | 'createdAt' | 'updatedAt'>> & {
        invoiceDueDate?: string | Date | null;
      })
    | null;
}

export class CreateProductUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly stockRepository: IStockRepository,
  ) {}

  async execute(data: CreateProductDTO): Promise<{ product: Product }> {
    if (!data.warehouseId || !data.name) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const registrationNumber = data.registrationNumber ?? null;
    const category = mapToProductCategory(data.category, registrationNumber);
    const fitosanitariService = FitosanitariLookupService.getInstance();
    const administrativeStatus =
      category === ProductCategory.PESTICIDE
        ? fitosanitariService.lookupStatus(registrationNumber, data.name)
        : null;

    const product = Product.create({
      warehouseId: data.warehouseId,
      name: data.name,
      sku: data.sku ?? 'N/A',
      barcode: data.barcode ?? null,
      category,
      type: data.type ?? 'Generico',
      description: data.description ?? null,
      administrativeStatus,
      registrationNumber,
      labelUrl: data.labelUrl ?? null,
      labelMetadata: data.labelMetadata ?? null,
      vintage: data.vintage ?? null,
      unitPrice: data.unitPrice ?? null,
      vatRate: data.vatRate ?? null,
      unitOfMeasure: data.unitOfMeasure ?? null,
      isActive: data.isActive ?? true,
    });

    const createdProduct = await this.productRepository.create(product);

    if (data.stock) {
      const {
        quantity,
        unitOfMeasureQuantity,
        sourceFileId = null,
        price = 0,
        unitOfMeasurePrice = 'EUR',
        type = 'IN',
        ddtCode = null,
        ddtDate = null,
        ddtUrlFile = null,
        invoiceCode = null,
        invoiceDate = null,
        invoiceDueDate = null,
        invoiceUrlFile = null,
        companySupplierName = null,
        addressSupplier = null,
        vatNumberSupplier = null,
        jobId = null,
      } = data.stock as Required<
        Pick<NonNullable<CreateProductDTO['stock']>, 'quantity' | 'unitOfMeasureQuantity'>
      > &
        Partial<NonNullable<CreateProductDTO['stock']>>;

      const validation = validateStockFields(quantity, unitOfMeasureQuantity);
      if (!validation.valid) {
        throw AppError.badRequest(
          `Invalid or missing required stock fields: ${validation.reason}`,
          'INVALID_STOCK_FIELDS',
        );
      }

      const stockEntity = Stock.create({
        productId: createdProduct.id,
        sourceFileId,
        jobId,
        quantity,
        unitOfMeasureQuantity: unitOfMeasureQuantity.trim(),
        price: typeof price === 'number' && !Number.isNaN(price) ? price : 0,
        unitOfMeasurePrice: defaultUnitOfMeasurePrice(unitOfMeasurePrice),
        type,
        ddtCode: normalizeDdtCode(ddtCode),
        ddtDate: parseDate(ddtDate),
        ddtUrlFile,
        invoiceCode,
        invoiceDate: parseDate(invoiceDate),
        invoiceDueDate: parseDate(invoiceDueDate),
        invoiceUrlFile,
        companySupplierName,
        addressSupplier,
        vatNumberSupplier,
      });

      await this.stockRepository.create(stockEntity);
    }

    return { product: createdProduct };
  }
}
