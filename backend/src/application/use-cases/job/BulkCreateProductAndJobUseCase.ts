import { AppError } from '../../../domain/errors/AppError';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { Job } from '../../../domain/entities/Job';
import { Stock } from '../../../domain/entities/Stock';
import { Product } from '../../../domain/entities/Product';
import { Warehouse } from '../../../domain/entities/Warehouse';
import { CreateStockProps } from '../../../domain/dtos/stock.dto';
import { UpsertProductBaseDTO } from '../../../domain/dtos/product.dto';
import { JobCategory, Prisma, ProductCategory } from '@prisma/client';
import { FitosanitariLookupService } from '../../../infrastructure/services/utils/FitosanitariLookupService';
import { mapToProductCategory } from '../product/product-category.mapper';
import {
  normalizeDdtCode,
  defaultUnitOfMeasurePrice,
} from '../../../infrastructure/utils/stock.util';

export interface BulkStockItemDTO extends Omit<CreateStockProps, 'productId' | 'jobId'> {
  productId?: string;
  product?: UpsertProductBaseDTO;
}

export interface BulkCreateJobItemDTO {
  productionUnitId?: string;
  dateOfOpeation: Date;
  category: JobCategory;
  quantity: number;
  unitOfMeasureQuantity: string;
  jobId?: string | null;
  productQuantityTreated?: number | null;
  unitOfMeasureProductQuantityTreated?: string | null;
  modeOfApplication?: string | null;
  avversity?: string | null;
  giustification?: string | null;
  treatedSurface?: number | null;
  isLocalizedTreatment?: boolean | null;
  userId?: string | null;
  note?: string | null;
  alertNotes?: Prisma.JsonValue | null;
  history?: Prisma.JsonValue | null;
  totalDistributedWaterL?: number | null;
  machineId?: string | null;
  stocks?: Array<BulkStockItemDTO>;
}

export interface BulkCreateProductAndJobDTO {
  items: BulkCreateJobItemDTO[];
}

export class BulkCreateProductAndJobUseCase {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
    private readonly productRepository: IProductRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
    private readonly fieldRepository: IFieldRepository,
    private readonly warehouseRepository: IWarehouseRepository,
  ) {}

  async execute(data: BulkCreateProductAndJobDTO): Promise<{ jobs: Job[] }> {
    if (!data.items || data.items.length === 0) {
      throw AppError.badRequest('Empty payload', 'EMPTY_PAYLOAD');
    }

    const createdJobs: Job[] = [];

    for (const item of data.items) {
      if (
        !item.productionUnitId ||
        !item.dateOfOpeation ||
        !item.category ||
        !item.quantity ||
        !item.unitOfMeasureQuantity
      ) {
        throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
      }

      const pu = await this.productionUnitRepository.findById(item.productionUnitId);
      if (!pu) {
        throw AppError.notFound('Production Unit not found', 'PRODUCTION_UNIT_NOT_FOUND');
      }
      const fieldIds = await this.productionUnitRepository.listFieldIdsByProductionUnit(
        item.productionUnitId,
      );
      const fieldId = fieldIds[0];
      const field = fieldId ? await this.fieldRepository.findById(fieldId) : null;
      if (!field) {
        throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
      }
      if (!field.companyId) {
        throw AppError.badRequest('Field has no associated company', 'FIELD_NO_COMPANY');
      }

      const warehouses = await this.warehouseRepository.findManyByCompanyId(field.companyId);
      let targetWarehouse: Warehouse;

      if (!warehouses || warehouses.length === 0) {
        // Create a default warehouse for the company if none exists
        const defaultWarehouse = Warehouse.create({
          companyId: field.companyId,
          name: 'Magazzino Principale',
          address: 'N/A',
          nation: null,
          region: null,
          city: null,
          cap: null,
          sezione: '0',
          foglio: '0',
          particella: '0',
          subalterno: null,
        });
        targetWarehouse = await this.warehouseRepository.create(defaultWarehouse);
      } else {
        targetWarehouse = warehouses[0];
      }

      const job = Job.create({
        productionUnitId: item.productionUnitId,
        productionCycleId:
          (item as { productionCycleId?: string | null }).productionCycleId ?? null,
        jobId: item.jobId ?? null,
        dateOfOpeation: item.dateOfOpeation,
        isVerified: false,
        conformityChecked: false,
        category: item.category,
        quantity: item.quantity,
        unitOfMeasureQuantity: item.unitOfMeasureQuantity,
        productQuantityTreated: item.productQuantityTreated ?? null,
        unitOfMeasureProductQuantityTreated: item.unitOfMeasureProductQuantityTreated ?? null,
        modeOfApplication: item.modeOfApplication ?? null,
        avversity: item.avversity ?? null,
        giustification: item.giustification ?? null,
        treatedSurface: item.treatedSurface ?? null,
        isLocalizedTreatment: item.isLocalizedTreatment ?? null,
        userId: item.userId ?? null,
        note: item.note ?? null,
        alertNotes: item.alertNotes ?? null,
        history: item.history ?? null,
        appliedRules: null,
        totalDistributedWaterL: item.totalDistributedWaterL ?? null,
        machineId: item.machineId ?? null,
      });

      const createdJob = await this.jobRepository.create(job);

      if (item.stocks && item.stocks.length > 0) {
        const stockEntities: Stock[] = [];
        for (const s of item.stocks) {
          let productId: string;

          // If productId is provided, use it directly (product already exists)
          if (s.productId) {
            const existingProduct = await this.productRepository.findById(s.productId);
            if (!existingProduct) {
              throw AppError.notFound(
                `Product with id ${s.productId} not found`,
                'PRODUCT_NOT_FOUND',
              );
            }
            productId = existingProduct.id;
          } else if (s.product) {
            // Find or create product in the company first available warehouse
            const prod = s.product;
            if (!prod.name || !prod.category || !prod.type) {
              throw AppError.badRequest('Invalid product data', 'INVALID_PRODUCT_DATA');
            }

            // Attempt to find existing product by name within target warehouse
            const existing = (
              await this.productRepository.findManyByWarehouseId(targetWarehouse.id)
            ).find((p) => p.name.toLowerCase().trim() === prod.name.toLowerCase().trim());

            if (existing) {
              productId = existing.id;
            } else {
              // Generate SKU if not provided
              const generatedSku =
                prod.sku || `SKU-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
              const registrationNumber = prod.registrationNumber ?? null;
              const category = mapToProductCategory(prod.category, registrationNumber);
              const fitosanitariService = FitosanitariLookupService.getInstance();
              const administrativeStatus =
                category === ProductCategory.PESTICIDE
                  ? fitosanitariService.lookupStatus(registrationNumber, prod.name)
                  : null;

              const productEntity = Product.create({
                name: prod.name,
                sku: generatedSku,
                barcode: prod.barcode ?? null,
                category,
                type: prod.type,
                description: prod.description ?? null,
                administrativeStatus,
                registrationNumber,
                labelUrl: prod.labelUrl ?? null,
                labelMetadata: prod.labelMetadata ?? null,
                warehouseId: targetWarehouse.id,
              });
              const createdProduct = await this.productRepository.create(productEntity);
              productId = createdProduct.id;
            }
          } else {
            throw AppError.badRequest(
              'Either productId or product must be provided',
              'MISSING_PRODUCT_DATA',
            );
          }

          stockEntities.push(
            Stock.create({
              productId,
              jobId: createdJob.id,
              quantity: s.quantity,
              unitOfMeasureQuantity: s.unitOfMeasureQuantity,
              price: s.price ?? 0,
              unitOfMeasurePrice: defaultUnitOfMeasurePrice(s.unitOfMeasurePrice),
              type: s.type,
              ddtCode: normalizeDdtCode(s.ddtCode),
              ddtDate: s.ddtDate ?? null,
              ddtUrlFile: s.ddtUrlFile ?? null,
              invoiceCode: s.invoiceCode ?? null,
              invoiceDate: s.invoiceDate ?? null,
              invoiceDueDate: s.invoiceDueDate ?? null,
              invoiceUrlFile: s.invoiceUrlFile ?? null,
              companySupplierName: s.companySupplierName ?? null,
              addressSupplier: s.addressSupplier ?? null,
              vatNumberSupplier: s.vatNumberSupplier ?? null,
            }),
          );
        }
        await this.stockRepository.createMany(stockEntities);
      }

      createdJobs.push(createdJob);
    }

    return { jobs: createdJobs };
  }
}
