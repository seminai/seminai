import { ProductCategory } from '@prisma/client';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { Product } from '../../../domain/entities/Product';
import { Stock } from '../../../domain/entities/Stock';
import { Warehouse } from '../../../domain/entities/Warehouse';
import { parseDate } from '../../../infrastructure/utils/date.util';
import { AppError } from '../../../domain/errors/AppError';
import { mapToProductCategory } from './product-category.mapper';
import { FitosanitariLookupService } from '../../../infrastructure/services/utils/FitosanitariLookupService';
import {
  parseProductName,
  convertPiecesToRealUnit,
  isPiecesUnit,
  resolveOfficialName,
} from '../../../infrastructure/services/utils/ProductNameParser';
import { convertQuantityToCanonicalUnit } from '../../../infrastructure/utils/quantityConversion';
import {
  normalizeDdtCode,
  defaultUnitOfMeasurePrice,
} from '../../../infrastructure/utils/stock.util';
import type {
  CreateOrUpdateProductsAndStocksBulkDTO,
  CreateOrUpdateResult,
} from './product-stock-input.types';

export type {
  CreateOrUpdateProductsAndStocksBulkDTO,
  CreateOrUpdateResult,
  ProductWithStockInput,
} from './product-stock-input.types';

export class CreateOrUpdateProductsAndStocksBulkUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly stockRepository: IStockRepository,
    private readonly warehouseRepository: IWarehouseRepository,
  ) {}

  async execute(data: CreateOrUpdateProductsAndStocksBulkDTO): Promise<CreateOrUpdateResult> {
    const result: CreateOrUpdateResult = {
      productsCreated: 0,
      productsUpdated: 0,
      stocksCreated: 0,
      errors: [],
      productIds: [],
    };

    const resolvedWarehouseId = await this.resolveWarehouseId(data.companyId, data.warehouseId);

    const existingProducts =
      await this.productRepository.findManyByWarehouseId(resolvedWarehouseId);
    const fitosanitariService = FitosanitariLookupService.getInstance();

    /** Reuse product by name within the same request to avoid creating duplicates when multiple items share the same name. */
    const productIdByNameInRequest = new Map<string, string>();

    for (let i = 0; i < data.products.length; i++) {
      const item = data.products[i];
      const itemIndex = i + 1;

      try {
        if (!item.name || item.name.trim() === '') {
          result.errors.push(`Item ${itemIndex}: Product name is required`);
          continue;
        }

        const rawProductName = item.name.trim();
        const parsed = parseProductName(rawProductName);
        const normalizedName = resolveOfficialName(parsed.baseName);
        const nameLower = normalizedName.toLowerCase();
        const registrationNumber = item.registrationNumber?.trim() ?? null;
        const mappedCategory = mapToProductCategory(item.category, registrationNumber);
        const mappedAdministrativeStatus =
          mappedCategory === ProductCategory.PESTICIDE
            ? fitosanitariService.lookupStatus(registrationNumber, normalizedName)
            : null;
        let productId: string;

        if (item.id) {
          const existingById = await this.productRepository.findById(item.id);
          if (!existingById) {
            result.errors.push(`Item ${itemIndex}: Product with id ${item.id} not found`);
            continue;
          }
          if (existingById.warehouseId !== resolvedWarehouseId) {
            result.errors.push(
              `Item ${itemIndex}: Product ${item.id} does not belong to the specified warehouse`,
            );
            continue;
          }
          productId = existingById.id;
          if (
            mappedCategory === ProductCategory.PESTICIDE &&
            (existingById.category !== ProductCategory.PESTICIDE ||
              existingById.registrationNumber !== registrationNumber)
          ) {
            await this.productRepository.update(productId, {
              category: mappedCategory,
              registrationNumber,
              administrativeStatus: mappedAdministrativeStatus,
            });
          }
          result.productsUpdated++;
          // When product already exists, only add stock; do not update product metadata.
          productIdByNameInRequest.set(nameLower, productId);
        } else {
          const reusedInRequest = productIdByNameInRequest.get(nameLower);
          if (reusedInRequest) {
            productId = reusedInRequest;
          } else {
            const baseNameLower = parsed.baseName.toLowerCase();
            const existingProduct = existingProducts.find(
              (p) => p.name.toLowerCase() === nameLower || p.name.toLowerCase() === baseNameLower,
            );
            if (existingProduct) {
              productId = existingProduct.id;
              if (
                mappedCategory === ProductCategory.PESTICIDE &&
                (existingProduct.category !== ProductCategory.PESTICIDE ||
                  existingProduct.registrationNumber !== registrationNumber)
              ) {
                await this.productRepository.update(productId, {
                  category: mappedCategory,
                  registrationNumber,
                  administrativeStatus: mappedAdministrativeStatus,
                });
              }
              result.productsUpdated++;
              productIdByNameInRequest.set(nameLower, productId);
            } else {
              const newProduct = Product.create({
                warehouseId: resolvedWarehouseId,
                name: normalizedName,
                sku: item.sku?.trim() ?? 'N/A',
                barcode: item.barcode?.trim() ?? null,
                category: mappedCategory,
                type: item.type ?? 'Generico',
                description: item.description ?? null,
                administrativeStatus: mappedAdministrativeStatus,
                registrationNumber,
                labelUrl: item.labelUrl ?? null,
                labelMetadata: (item.labelMetadata as never) ?? null,
              });

              const createdProduct = await this.productRepository.create(newProduct);
              productId = createdProduct.id;
              result.productsCreated++;
              productIdByNameInRequest.set(nameLower, productId);
            }
          }
        }

        if (!result.productIds.includes(productId)) {
          result.productIds.push(productId);
        }

        if (item.stock) {
          let { quantity, unitOfMeasureQuantity } = item.stock;
          const {
            price = 0,
            unitOfMeasurePrice = 'EUR',
            type = 'IN',
            sourceFileId = null,
            sourceExtractionId = null,
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
            productNameAsOnDocument = null,
            quantityConverted: inputQuantityConverted = null,
            unitMeasureConverted: inputUnitMeasureConverted = null,
          } = item.stock;

          if (typeof quantity !== 'number' || Number.isNaN(quantity)) {
            result.errors.push(`Item ${itemIndex}: Invalid stock quantity`);
            continue;
          }

          if (!unitOfMeasureQuantity || unitOfMeasureQuantity.trim() === '') {
            result.errors.push(`Item ${itemIndex}: Stock unitOfMeasureQuantity is required`);
            continue;
          }

          let stockPackagingInfo = parsed.packagingInfo;
          if (isPiecesUnit(unitOfMeasureQuantity)) {
            const conversion = convertPiecesToRealUnit(
              quantity,
              unitOfMeasureQuantity,
              rawProductName,
            );
            if (conversion.converted) {
              quantity = conversion.quantity;
              unitOfMeasureQuantity = conversion.unitOfMeasure;
              stockPackagingInfo = conversion.packagingInfo;
            }
          }

          const stockNotes = rawProductName !== normalizedName ? rawProductName : null;

          const canonicalConversion =
            inputQuantityConverted !== null && inputUnitMeasureConverted != null
              ? null
              : convertQuantityToCanonicalUnit(quantity, unitOfMeasureQuantity.trim());
          const quantityConverted =
            inputQuantityConverted ?? canonicalConversion?.quantityConverted ?? null;
          const unitMeasureConverted =
            inputUnitMeasureConverted ?? canonicalConversion?.unitMeasureConverted ?? null;

          const stock = Stock.create({
            productId,
            sourceFileId,
            sourceExtractionId,
            jobId: null,
            quantity,
            unitOfMeasureQuantity: unitOfMeasureQuantity.trim(),
            price,
            unitOfMeasurePrice: defaultUnitOfMeasurePrice(unitOfMeasurePrice),
            type,
            ddtCode: normalizeDdtCode(ddtCode),
            ddtDate: ddtDate ? parseDate(ddtDate) : null,
            ddtUrlFile,
            invoiceCode,
            invoiceDate: invoiceDate ? parseDate(invoiceDate) : null,
            invoiceDueDate: invoiceDueDate ? parseDate(invoiceDueDate) : null,
            invoiceUrlFile,
            companySupplierName,
            addressSupplier,
            vatNumberSupplier,
            notes: stockNotes,
            packagingInfo: stockPackagingInfo,
            productNameAsOnDocument: productNameAsOnDocument ?? null,
            quantityConverted,
            unitMeasureConverted,
          });

          await this.stockRepository.create(stock);
          result.stocksCreated++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Item ${itemIndex}: ${message}`);
      }
    }

    return result;
  }

  private async resolveWarehouseId(companyId: string, warehouseId?: string): Promise<string> {
    if (warehouseId) {
      const warehouse = await this.warehouseRepository.findById(warehouseId);
      if (!warehouse) {
        throw AppError.notFound('Warehouse not found', 'WAREHOUSE_NOT_FOUND');
      }
      if (warehouse.companyId !== companyId) {
        throw AppError.forbidden(
          'Warehouse does not belong to the specified company',
          'WAREHOUSE_NOT_OWNED',
        );
      }
      return warehouseId;
    }

    const warehouses = await this.warehouseRepository.findManyByCompanyId(companyId);
    if (warehouses.length > 0) {
      return warehouses[0].id;
    }

    const defaultWarehouse = Warehouse.create({
      companyId,
      name: 'Magazzino Principale',
      address: 'N/A',
      nation: null,
      region: null,
      city: null,
      cap: null,
      sezione: 'N/A',
      foglio: 'N/A',
      particella: 'N/A',
      subalterno: null,
    });

    const createdWarehouse = await this.warehouseRepository.create(defaultWarehouse);
    return createdWarehouse.id;
  }
}
