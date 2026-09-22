import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteTestCompany,
  deleteAllTestCompanies,
} from './helpers';
import { Product } from '../domain/entities/Product';
import { ProductCategory } from '@prisma/client';
import { Stock } from '../domain/entities/Stock';
import { Warehouse } from '../domain/entities/Warehouse';

describe('Stock Integration Tests', () => {
  let stockRepository: PrismaStockRepository;
  let productRepository: PrismaProductRepository;
  let testUserId: string;
  let testCompanyId: string;
  let testWarehouseId: string;
  let testProductId: string;

  beforeAll(async () => {
    stockRepository = new PrismaStockRepository(prisma);
    productRepository = new PrismaProductRepository(prisma);
    const testUser = await createTestUser();
    testUserId = testUser.id!;
  });

  beforeEach(async () => {
    // recreate company/warehouse/product for each test without direct prisma calls
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

    const product = Product.create({
      warehouseId: testWarehouseId,
      name: `P-${Date.now()}`,
      sku: `SKU-${Date.now()}`,
      barcode: null,
      category: ProductCategory.SEED,
      type: 'Generic',
      description: 'Test product',
      administrativeStatus: null,
      registrationNumber: null,
      labelUrl: null,
      labelMetadata: null,
    });
    const created = await productRepository.create(product);
    testProductId = created.id;
  });

  afterAll(async () => {
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  describe('Create', () => {
    it('should create positive stock movement', async () => {
      const stockEntity = Stock.create({
        productId: testProductId,
        quantity: 10,
        unitOfMeasureQuantity: 'kg',
        price: 100,
        unitOfMeasurePrice: 'EUR',
        type: 'IN',
        ddtCode: null,
        ddtUrlFile: null,
        invoiceCode: null,
        invoiceUrlFile: null,
        companySupplierName: null,
        addressSupplier: null,
        vatNumberSupplier: null,
      });
      const created = await stockRepository.create(stockEntity);
      expect(created.id).toBeDefined();
      const productWithStocks = await productRepository.findById(testProductId);
      const hasQuantity = productWithStocks?.stocks.some((s) => s.quantity === 10);
      expect(hasQuantity).toBe(true);
    });

    it('should create negative stock movement', async () => {
      const stockEntity = Stock.create({
        productId: testProductId,
        quantity: -5,
        unitOfMeasureQuantity: 'kg',
        price: 50,
        unitOfMeasurePrice: 'EUR',
        type: 'OUT',
        ddtCode: null,
        ddtUrlFile: null,
        invoiceCode: null,
        invoiceUrlFile: null,
        companySupplierName: null,
        addressSupplier: null,
        vatNumberSupplier: null,
      });
      const created = await stockRepository.create(stockEntity);
      expect(created.id).toBeDefined();
      const productWithStocks = await productRepository.findById(testProductId);
      const hasQuantity = productWithStocks?.stocks.some((s) => s.quantity === -5);
      expect(hasQuantity).toBe(true);
    });
  });
});
