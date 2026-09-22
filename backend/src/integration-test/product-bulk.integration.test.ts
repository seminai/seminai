import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteTestCompany,
  deleteAllTestCompanies,
} from './helpers';
import { ProductCategory } from '@prisma/client';
import { CreateProductsBulkUseCase } from '../application/use-cases/product/CreateProductsBulkUseCase';
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { Warehouse } from '../domain/entities/Warehouse';

describe('Product Bulk Integration Tests', () => {
  let productRepository: PrismaProductRepository;
  let stockRepository: PrismaStockRepository;
  let testUserId: string;
  let testCompanyId: string;
  let testWarehouseId: string;

  beforeAll(async () => {
    productRepository = new PrismaProductRepository(prisma);
    stockRepository = new PrismaStockRepository(prisma);

    const testUser = await createTestUser();
    testUserId = testUser.id!;
    // Company/warehouse will be created in beforeEach to avoid direct Prisma cleanup
  });

  afterAll(async () => {
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id!;
    const warehouseRepository = new PrismaWarehouseRepository(prisma);
    const whEntity = Warehouse.create({
      companyId: testCompanyId,
      name: `WH-${Date.now()}`,
      nation: 'Italia',
      region: 'Lazio',
      city: 'Roma',
      address: 'Via Roma 1',
      cap: '00100',
      sezione: 'S',
      foglio: '10',
      particella: '100',
      subalterno: '1',
    });
    const warehouse = await warehouseRepository.create(whEntity);
    testWarehouseId = warehouse.id;
  });

  it('should create many products in the same warehouse with one stock each', async () => {
    const useCase = new CreateProductsBulkUseCase(productRepository, stockRepository);
    const { products } = await useCase.execute({
      warehouseId: testWarehouseId,
      products: [
        {
          name: `P1-${Date.now()}`,
          sku: `SKU1-${Date.now()}`,
          barcode: null,
          category: ProductCategory.SEED,
          type: 'Generic',
          description: 'P1',
          registrationNumber: null,
          labelUrl: null,
          labelMetadata: null,
          stock: {
            quantity: 10,
            unitOfMeasureQuantity: 'kg',
            price: 100,
            unitOfMeasurePrice: 'EUR',
            type: 'IN',
            ddtCode: `DDT-${Date.now()}-P1`,
            ddtUrlFile: null,
            invoiceCode: null,
            invoiceDate: new Date('2026-02-01T00:00:00.000Z'),
            invoiceUrlFile: null,
            companySupplierName: null,
            addressSupplier: null,
            vatNumberSupplier: null,
          },
        },
        {
          name: `P2-${Date.now()}`,
          sku: `SKU2-${Date.now()}`,
          barcode: null,
          category: ProductCategory.SEED,
          type: 'Generic',
          description: 'P2',
          registrationNumber: null,
          labelUrl: null,
          labelMetadata: null,
          stock: {
            quantity: -3,
            unitOfMeasureQuantity: 'kg',
            price: 30,
            unitOfMeasurePrice: 'EUR',
            type: 'OUT',
            ddtCode: `DDT-${Date.now()}-P2`,
            ddtUrlFile: null,
            invoiceCode: null,
            invoiceDate: new Date('2026-02-02T00:00:00.000Z'),
            invoiceUrlFile: null,
            companySupplierName: null,
            addressSupplier: null,
            vatNumberSupplier: null,
          },
        },
      ],
    });

    expect(products.length).toBe(2);
    const p1 = await productRepository.findById(products[0].id);
    const p2 = await productRepository.findById(products[1].id);
    expect(p1?.stocks.length).toBe(1);
    expect(p2?.stocks.length).toBe(1);
    expect(p1?.stocks[0].quantity).toBe(10);
    expect(p2?.stocks[0].quantity).toBe(-3);
  });

  it('should force bulk product category to PESTICIDE when registration number is provided', async () => {
    const useCase = new CreateProductsBulkUseCase(productRepository, stockRepository);
    const { products } = await useCase.execute({
      warehouseId: testWarehouseId,
      products: [
        {
          name: `P-REG-BULK-${Date.now()}`,
          sku: `SKU-REG-BULK-${Date.now()}`,
          barcode: null,
          category: ProductCategory.SEED,
          type: 'Generic',
          description: 'with registration',
          registrationNumber: 'REG-123-BULK',
          labelUrl: null,
          labelMetadata: null,
        },
      ],
    });
    expect(products.length).toBe(1);
    const created = await productRepository.findById(products[0].id);
    expect(created).not.toBeNull();
    expect(created?.category).toBe(ProductCategory.PESTICIDE);
  });
});
