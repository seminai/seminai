import { CreateProductDTO } from './CreateProductUseCase';
import { ProductCategory } from '@prisma/client';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { Product } from '../../../domain/entities/Product';
import { Stock } from '../../../domain/entities/Stock';
import { parseDate } from '../../../infrastructure/utils/date.util';
import { mapToProductCategory } from './product-category.mapper';
import { FitosanitariLookupService } from '../../../infrastructure/services/utils/FitosanitariLookupService';
import {
  validateStockFields,
  normalizeDdtCode,
  defaultUnitOfMeasurePrice,
} from '../../../infrastructure/utils/stock.util';
import { toTitleCase } from '../../../utils/string.util';

export interface CreateProductsBulkDTO {
  warehouseId: string;
  products: Array<Omit<CreateProductDTO, 'warehouseId'>>;
}

export class CreateProductsBulkUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly stockRepository: IStockRepository,
  ) {}

  async execute(
    data: CreateProductsBulkDTO,
  ): Promise<{ products: Product[]; stockErrors: string[] }> {
    const fitosanitariService = FitosanitariLookupService.getInstance();

    const products: Product[] = data.products.map((item) => {
      const registrationNumber = item.registrationNumber ?? null;
      const category = mapToProductCategory(item.category, registrationNumber);
      const administrativeStatus =
        category === ProductCategory.PESTICIDE
          ? fitosanitariService.lookupStatus(registrationNumber, item.name)
          : null;

      return Product.create({
        warehouseId: data.warehouseId,
        name: toTitleCase(item.name),
        sku: item.sku ?? 'N/A',
        barcode: item.barcode ?? null,
        category,
        type: item.type ?? 'Generico',
        description: item.description ?? null,
        administrativeStatus,
        registrationNumber,
        labelUrl: item.labelUrl ?? null,
        labelMetadata: item.labelMetadata ?? null,
      });
    });

    const stocks: Stock[] = [];
    const stockErrors: string[] = [];

    data.products.forEach((item, index) => {
      if (!item.stock) return;
      const {
        quantity,
        unitOfMeasureQuantity,
        sourceFileId = null,
        price = 0,
        unitOfMeasurePrice,
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
      } = item.stock as Required<
        Pick<NonNullable<CreateProductDTO['stock']>, 'quantity' | 'unitOfMeasureQuantity'>
      > &
        Partial<NonNullable<CreateProductDTO['stock']>>;

      const validation = validateStockFields(quantity, unitOfMeasureQuantity);
      if (!validation.valid) {
        stockErrors.push(
          `Product "${item.name}" (index ${index}): stock skipped – ${validation.reason}`,
        );
        return;
      }

      const product = products[index];
      stocks.push(
        Stock.create({
          productId: product.id,
          sourceFileId,
          jobId,
          quantity,
          unitOfMeasureQuantity,
          price,
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
        }),
      );
    });

    await this.productRepository.createMany(products);
    if (stocks.length > 0) {
      await this.stockRepository.createMany(stocks);
    }

    return { products, stockErrors };
  }
}
