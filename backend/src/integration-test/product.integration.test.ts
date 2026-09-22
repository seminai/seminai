import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { CreateProductUseCase } from '../application/use-cases/product/CreateProductUseCase';
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
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { Warehouse } from '../domain/entities/Warehouse';
import { Stock } from '../domain/entities/Stock';

describe('Product Integration Tests', () => {
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

  describe('Create and Read', () => {
    it('should create product with optional stock and fetch by id with stocks', async () => {
      const useCase = new CreateProductUseCase(productRepository, stockRepository);
      const { product: created } = await useCase.execute({
        warehouseId: testWarehouseId,
        name: `P-${Date.now()}`,
        sku: `SKU-${Date.now()}`,
        barcode: null,
        category: ProductCategory.SEED,
        type: 'Generic',
        description: 'Test product',
        registrationNumber: null,
        labelUrl: null,
        labelMetadata: null,
        stock: {
          quantity: 10,
          unitOfMeasureQuantity: 'kg',
          price: 100,
          unitOfMeasurePrice: 'EUR',
          type: 'IN',
          ddtCode: 'DDT-TEST-001',
          ddtUrlFile: null,
          invoiceCode: null,
          invoiceDate: new Date('2026-02-01T00:00:00.000Z'),
          invoiceUrlFile: null,
          companySupplierName: null,
          addressSupplier: null,
          vatNumberSupplier: null,
        },
      });
      expect(created.id).toBeDefined();

      const found = await productRepository.findById(created.id);
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe(created.name);
      expect(found?.stocks.length).toBe(1);
      expect(found?.stocks[0].quantity).toBe(10);
    });

    it('should list by warehouse including stocks', async () => {
      const input = Product.create({
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
      const created = await productRepository.create(input);
      await stockRepository.create(
        Stock.create({
          productId: created.id,
          quantity: 5,
          unitOfMeasureQuantity: 'kg',
          price: 50,
          unitOfMeasurePrice: 'EUR',
          type: 'IN',
          ddtCode: null,
          ddtUrlFile: null,
          invoiceCode: null,
          invoiceUrlFile: null,
          companySupplierName: null,
          addressSupplier: null,
          vatNumberSupplier: null,
        }),
      );
      const list = await productRepository.findManyByWarehouseId(testWarehouseId);
      expect(list.length).toBeGreaterThanOrEqual(1);
      const withStocks = list.find((p) => p.id === created.id);
      expect(withStocks?.stocks.length).toBe(1);
    });

    it('should persist product stock with price and full invoice fields', async () => {
      const useCase = new CreateProductUseCase(productRepository, stockRepository);
      const invoiceDate = new Date('2026-02-10T00:00:00.000Z');
      const invoiceDueDate = new Date('2026-03-10T00:00:00.000Z');
      const ddtDate = new Date('2026-02-09T00:00:00.000Z');
      const { product: created } = await useCase.execute({
        warehouseId: testWarehouseId,
        name: `P-INVOICE-${Date.now()}`,
        sku: `SKU-INVOICE-${Date.now()}`,
        barcode: '1234567890123',
        category: ProductCategory.PESTICIDE,
        type: 'Fungicide',
        description: 'Product created from invoice data',
        registrationNumber: 'REG-12345',
        labelUrl: 'https://example.com/label.pdf',
        labelMetadata: { source: 'integration-test' },
        stock: {
          quantity: 24,
          unitOfMeasureQuantity: 'kg',
          price: 18.75,
          unitOfMeasurePrice: 'EUR/kg',
          type: 'IN',
          ddtCode: 'DDT-2026-0001',
          ddtDate,
          ddtUrlFile: 'https://example.com/ddt.pdf',
          invoiceCode: 'INV-2026-0042',
          invoiceDate,
          invoiceDueDate,
          invoiceUrlFile: 'https://example.com/invoice.pdf',
          companySupplierName: 'Supplier SPA',
          addressSupplier: 'Via Fornitori 10, Roma',
          vatNumberSupplier: 'IT12345678901',
        },
      });
      const found = await productRepository.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.stocks.length).toBe(1);
      const createdStock = found?.stocks[0];
      expect(createdStock).toBeDefined();
      expect(createdStock?.quantity).toBe(24);
      expect(createdStock?.price).toBe(18.75);
      expect(createdStock?.unitOfMeasurePrice).toBe('EUR/kg');
      expect(createdStock?.type).toBe('IN');
      expect(createdStock?.ddtCode).toBe('DDT-2026-0001');
      expect(createdStock?.ddtUrlFile).toBe('https://example.com/ddt.pdf');
      expect(createdStock?.invoiceCode).toBe('INV-2026-0042');
      expect(createdStock?.invoiceUrlFile).toBe('https://example.com/invoice.pdf');
      expect(createdStock?.companySupplierName).toBe('Supplier SPA');
      expect(createdStock?.addressSupplier).toBe('Via Fornitori 10, Roma');
      expect(createdStock?.vatNumberSupplier).toBe('IT12345678901');
      expect(createdStock?.invoiceDate?.toISOString()).toBe(invoiceDate.toISOString());
      expect(createdStock?.invoiceDueDate?.toISOString()).toBe(invoiceDueDate.toISOString());
    });

    it('should force category to PESTICIDE when registration number is provided', async () => {
      const useCase = new CreateProductUseCase(productRepository, stockRepository);
      const { product: created } = await useCase.execute({
        warehouseId: testWarehouseId,
        name: `P-REG-${Date.now()}`,
        sku: `SKU-REG-${Date.now()}`,
        barcode: null,
        category: ProductCategory.SEED,
        type: 'Generic',
        description: null,
        registrationNumber: 'REG-99999',
        labelUrl: null,
        labelMetadata: null,
      });
      const found = await productRepository.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.category).toBe(ProductCategory.PESTICIDE);
    });
  });

  describe('Update and Delete', () => {
    it('should update fields', async () => {
      const input = Product.create({
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
      const created = await productRepository.create(input);

      const updated = await productRepository.update(created.id, {
        name: 'Updated Product',
        type: 'Updated Type',
      });

      expect(updated.name).toBe('Updated Product');
      const db = await prisma.product.findUnique({ where: { id: created.id } });
      expect(db?.name).toBe('Updated Product');
      expect(db?.type).toBe('Updated Type');
    });

    it('should delete', async () => {
      const input = Product.create({
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
      const created = await productRepository.create(input);

      await productRepository.delete(created.id);
      const found = await productRepository.findById(created.id);
      expect(found).toBeNull();
    });
  });

  describe('List by user', () => {
    it('should list products across user companies including stocks', async () => {
      const p = Product.create({
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
      const created = await productRepository.create(p);
      await stockRepository.create(
        Stock.create({
          productId: created.id,
          quantity: 7,
          unitOfMeasureQuantity: 'kg',
          price: 70,
          unitOfMeasurePrice: 'EUR',
          type: 'IN',
          ddtCode: null,
          ddtUrlFile: null,
          invoiceCode: null,
          invoiceUrlFile: null,
          companySupplierName: null,
          addressSupplier: null,
          vatNumberSupplier: null,
        }),
      );

      const list = await productRepository.findManyByUserId(testUserId);
      expect(list.length).toBeGreaterThanOrEqual(1);
      const found = list.find((x) => x.id === created.id);
      expect(found?.stocks.length).toBe(1);
    });
  });
});
