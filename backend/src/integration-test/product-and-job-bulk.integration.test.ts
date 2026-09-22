import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteAllTestCompanies } from './helpers';
import { PrismaJobRepository } from '../infrastructure/repositories/PrismaJobRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { Field } from '../domain/entities/Field';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
import { Warehouse } from '../domain/entities/Warehouse';
import { Product } from '../domain/entities/Product';
import { ProductCategory, JobCategory } from '@prisma/client';
import { BulkCreateProductAndJobUseCase } from '../application/use-cases/job/BulkCreateProductAndJobUseCase';

describe('Bulk Create Product and Job Integration', () => {
  let testUserId: string;
  let companyAId: string;
  let companyBId: string;
  let fieldRepo: PrismaFieldRepository;
  let puRepo: PrismaProductionUnitRepository;
  let whRepo: PrismaWarehouseRepository;
  let jobRepo: PrismaJobRepository;
  let stockRepo: PrismaStockRepository;
  let productRepo: PrismaProductRepository;

  let fieldAId: string;
  let fieldBId: string;
  let puAId: string;
  let puBId: string;
  let whAId: string;
  let whBId: string;

  beforeAll(async () => {
    jobRepo = new PrismaJobRepository(prisma);
    stockRepo = new PrismaStockRepository(prisma);
    productRepo = new PrismaProductRepository(prisma);
    fieldRepo = new PrismaFieldRepository(prisma);
    puRepo = new PrismaProductionUnitRepository(prisma);
    whRepo = new PrismaWarehouseRepository(prisma);

    const tu = await createTestUser();
    testUserId = tu.id!;
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);

    const companyA = await createTestCompany({ userId: testUserId, name: 'Company A' });
    const companyB = await createTestCompany({ userId: testUserId, name: 'Company B' });
    companyAId = companyA.id!;
    companyBId = companyB.id!;

    // Field & ProductionUnit for A
    const fieldA = Field.create({
      companyId: companyAId,
      name: `Field-A-${Date.now()}`,
      coordinates: [],
      latitude: null,
      longitude: null,
      polygon: null,
      gisHa: null,
      sauHa: 10,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
      soilType: null,
      uso: null,
      qualita: null,
      superficieCatastaleMq: 100,
      sezione: 'S',
      foglio: '10',
      particella: '100',
      subalterno: null,
      nation: null,
      region: null,
      city: null,
      address: 'Addr A',
      cap: null,
      variazioneMq: null,
      inizioConduzione: null,
      fineConduzione: null,
      bufferZoneNotes: null,
    });
    const createdFieldA = await fieldRepo.create(fieldA);
    fieldAId = createdFieldA.id;

    const puA = ProductionUnit.create({
      name: 'PU-A',
      cropName: 'Crop A',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 1,
      protectionStructure: 'N',
      startDate: new Date('2025-01-01'),
      floweringDate: new Date('2025-02-01'),
      harvestingDate: new Date('2025-03-01'),
      endDate: new Date('2025-04-01'),
      occupazione: null,
      destinazioneDiUso: null,
      acquaTotalePeridoL: 0,
    });
    const createdPuA = await puRepo.create(puA, [{ fieldId: fieldAId, areaHaOnField: 1 }]);
    puAId = createdPuA.id;

    // Field & ProductionUnit for B
    const fieldB = Field.create({
      companyId: companyBId,
      name: `Field-B-${Date.now()}`,
      coordinates: [],
      latitude: null,
      longitude: null,
      polygon: null,
      gisHa: null,
      sauHa: 10,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
      soilType: null,
      uso: null,
      qualita: null,
      superficieCatastaleMq: 100,
      sezione: 'S',
      foglio: '10',
      particella: '100',
      subalterno: null,
      nation: null,
      region: null,
      city: null,
      address: 'Addr B',
      cap: null,
      variazioneMq: null,
      inizioConduzione: null,
      fineConduzione: null,
      bufferZoneNotes: null,
    });
    const createdFieldB = await fieldRepo.create(fieldB);
    fieldBId = createdFieldB.id;

    const puB = ProductionUnit.create({
      name: 'PU-B',
      cropName: 'Crop B',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 1,
      protectionStructure: 'N',
      startDate: new Date('2025-01-01'),
      floweringDate: new Date('2025-02-01'),
      harvestingDate: new Date('2025-03-01'),
      endDate: new Date('2025-04-01'),
      occupazione: null,
      destinazioneDiUso: null,
      acquaTotalePeridoL: 0,
    });
    const createdPuB = await puRepo.create(puB, [{ fieldId: fieldBId, areaHaOnField: 1 }]);
    puBId = createdPuB.id;

    // Warehouses for A and B
    const whA = Warehouse.create({
      companyId: companyAId,
      name: `WH-A-${Date.now()}`,
      nation: 'Italia',
      region: 'Lazio',
      city: 'Roma',
      address: 'Via A 1',
      cap: '00100',
      sezione: 'S',
      foglio: '10',
      particella: '100',
      subalterno: '1',
    });
    const createdWhA = await whRepo.create(whA);
    whAId = createdWhA.id;

    const whB = Warehouse.create({
      companyId: companyBId,
      name: `WH-B-${Date.now()}`,
      nation: 'Italia',
      region: 'Lombardia',
      city: 'Milano',
      address: 'Via B 2',
      cap: '20100',
      sezione: 'S',
      foglio: '11',
      particella: '101',
      subalterno: '2',
    });
    const createdWhB = await whRepo.create(whB);
    whBId = createdWhB.id;

    // Pre-existing product in Company A warehouse
    const existingProductA = Product.create({
      warehouseId: whAId,
      name: 'Chem A',
      sku: 'SKU-EXIST',
      barcode: null,
      category: ProductCategory.PESTICIDE,
      type: 'X',
      description: null,
      administrativeStatus: null,
      registrationNumber: null,
      labelUrl: null,
      labelMetadata: null,
    });
    await productRepo.create(existingProductA);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it('should bulk create jobs across two companies, reusing existing product and creating new one, with related stocks', async () => {
    const useCase = new BulkCreateProductAndJobUseCase(
      jobRepo,
      stockRepo,
      productRepo,
      puRepo,
      fieldRepo,
      whRepo,
    );

    const { jobs } = await useCase.execute({
      items: [
        {
          productionUnitId: puAId,
          dateOfOpeation: new Date(),
          category: JobCategory.TREATMENT,
          quantity: 1,
          unitOfMeasureQuantity: 'L',
          stocks: [
            {
              product: {
                name: 'Chem A',
                sku: 'SKU-EXIST',
                barcode: null,
                category: ProductCategory.PESTICIDE,
                type: 'X',
                description: null,
                registrationNumber: null,
                labelUrl: null,
                labelMetadata: null,
              },
              quantity: -1,
              unitOfMeasureQuantity: 'L',
              price: 0,
              unitOfMeasurePrice: 'EUR',
              type: 'OUT',
            },
          ],
        },
        {
          productionUnitId: puBId,
          dateOfOpeation: new Date(),
          category: JobCategory.TREATMENT,
          quantity: 2,
          unitOfMeasureQuantity: 'L',
          stocks: [
            {
              product: {
                name: 'Chem B',
                sku: 'SKU-NEW',
                barcode: null,
                category: ProductCategory.PESTICIDE,
                type: 'X',
                description: null,
                registrationNumber: null,
                labelUrl: null,
                labelMetadata: null,
              },
              quantity: -2,
              unitOfMeasureQuantity: 'L',
              price: 0,
              unitOfMeasurePrice: 'EUR',
              type: 'OUT',
            },
          ],
        },
      ],
    });

    expect(jobs).toHaveLength(2);

    // Assert jobs per production unit
    const jobsA = await jobRepo.findManyByProductionUnitId(puAId);
    expect(jobsA).toHaveLength(1);
    const jobsB = await jobRepo.findManyByProductionUnitId(puBId);
    expect(jobsB).toHaveLength(1);

    // Verify product exists and is in the right warehouse (reused product).
    // Stocks attached to the product through findManyByWarehouseId are filtered by
    // VERIFIED_STOCK_WHERE (only jobs with isVerified=true). Jobs created by
    // BulkCreateProductAndJobUseCase have isVerified=false, so we read stocks
    // directly via Prisma to bypass that filter.
    const productsA = await productRepo.findManyByWarehouseId(whAId);
    const productA = productsA.find((p) => p.sku === 'SKU-EXIST');
    expect(productA).toBeDefined();
    expect(productA!.warehouseId).toBe(whAId);
    const stocksA = await prisma.stock.findMany({
      where: { productId: productA!.id, jobId: jobs[0].id },
    });
    expect(stocksA.length).toBeGreaterThanOrEqual(1);
    expect(stocksA[0].quantity.toString()).toBe('-1');

    // Same for Company B (new product created)
    const productsB = await productRepo.findManyByWarehouseId(whBId);
    const productB = productsB.find((p) => p.sku === 'SKU-NEW');
    expect(productB).toBeDefined();
    expect(productB!.warehouseId).toBe(whBId);
    const stocksB = await prisma.stock.findMany({
      where: { productId: productB!.id, jobId: jobs[1].id },
    });
    expect(stocksB.length).toBeGreaterThanOrEqual(1);
    expect(stocksB[0].quantity.toString()).toBe('-2');

    const jobProductLinks = await jobRepo.findManyByIdsWithProducts(jobs.map((job) => job.id));
    expect(jobProductLinks).toHaveLength(2);
    expect(jobProductLinks.every((link) => link.stockCount >= 1)).toBe(true);
    expect(jobProductLinks[0].products.length).toBeGreaterThanOrEqual(1);
    expect(jobProductLinks[1].products.length).toBeGreaterThanOrEqual(1);
  });
});
