import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestCompany,
  deleteTestUser,
  deleteAllTestCompanies,
} from './helpers';
import { PrismaJobRepository } from '../infrastructure/repositories/PrismaJobRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { Field } from '../domain/entities/Field';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
import { Warehouse } from '../domain/entities/Warehouse';
import { Product } from '../domain/entities/Product';
import { ProductCategory } from '@prisma/client';
import { CreateJobUseCase } from '../application/use-cases/job/CreateJobUseCase';
import { UpdateJobUseCase } from '../application/use-cases/job/UpdateJobUseCase';
import { ListJobsForCurrentUserUseCase } from '../application/use-cases/job/ListJobsForCurrentUserUseCase';

describe('Job Integration', () => {
  let testUserId: string;
  let testCompanyId: string;
  let fieldId: string;
  let productionUnitId: string;
  let jobRepository: PrismaJobRepository;
  let stockRepository: PrismaStockRepository;
  let productRepository: PrismaProductRepository;
  let testWarehouseId: string;

  beforeAll(async () => {
    jobRepository = new PrismaJobRepository(prisma);
    stockRepository = new PrismaStockRepository(prisma);
    const tu = await createTestUser();
    testUserId = tu.id!;
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id!;

    const fieldRepo = new PrismaFieldRepository(prisma);
    const field = Field.create({
      companyId: testCompanyId,
      name: `F-${Date.now()}`,
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
      address: 'Addr',
      cap: null,
      variazioneMq: null,
      inizioConduzione: null,
      fineConduzione: null,
      bufferZoneNotes: null,
    });
    const createdField = await fieldRepo.create(field);
    fieldId = createdField.id;

    const puRepo = new PrismaProductionUnitRepository(prisma);
    const pu = ProductionUnit.create({
      name: 'PU',
      cropName: 'Crop',
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
    const createdPu = await puRepo.create(pu, [{ fieldId, areaHaOnField: 1 }]);
    productionUnitId = createdPu.id;

    // create a warehouse for products used in stocks
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
    productRepository = new PrismaProductRepository(prisma);
  });

  afterAll(async () => {
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  it('should create a job with attached negative stock movements', async () => {
    const createUseCase = new CreateJobUseCase(jobRepository, stockRepository);
    const { job } = await createUseCase.execute({
      productionUnitId,
      dateOfOpeation: new Date(),
      category: 'TREATMENT' as any,
      quantity: 3,
      unitOfMeasureQuantity: 'L',
      stocks: [
        {
          productId: (
            await productRepository.create(
              Product.create({
                warehouseId: testWarehouseId,
                name: 'Chem',
                sku: `SKU-${Date.now()}`,
                barcode: null,
                category: ProductCategory.PESTICIDE,
                type: 'X',
                description: null,
                administrativeStatus: null,
                registrationNumber: null,
                labelUrl: null,
                labelMetadata: null,
              }),
            )
          ).id,
          quantity: -3,
          unitOfMeasureQuantity: 'L',
          price: 0,
          unitOfMeasurePrice: 'EUR',
          type: 'OUT',
        },
      ],
    });
    expect(job.id).toBeDefined();

    const stocks = await prisma.stock.findMany({ where: { jobId: job.id } });
    expect(stocks.length).toBe(1);
    expect(stocks[0].quantity).toBe(-3);
  });

  it('should replace attached stocks on update', async () => {
    const createUseCase = new CreateJobUseCase(jobRepository, stockRepository);
    const { job } = await createUseCase.execute({
      productionUnitId,
      dateOfOpeation: new Date(),
      category: 'TREATMENT' as any,
      quantity: 1,
      unitOfMeasureQuantity: 'L',
      stocks: [],
    });
    const updateUseCase = new UpdateJobUseCase(jobRepository, stockRepository);
    await updateUseCase.execute({
      id: job.id,
      data: {
        quantity: 2,
        stocks: [],
      },
    });
    const updated = await jobRepository.findById(job.id);
    expect(updated?.quantity).toBe(2);
  });

  it('should expose product details when listing jobs for current user', async () => {
    const product = await productRepository.create(
      Product.create({
        warehouseId: testWarehouseId,
        name: `Product-${Date.now()}`,
        sku: `SKU-${Date.now()}`,
        barcode: null,
        category: ProductCategory.PESTICIDE,
        type: 'Chemistry',
        description: null,
        administrativeStatus: null,
        registrationNumber: 'RN-12345',
        labelUrl: null,
        labelMetadata: null,
      }),
    );
    const createUseCase = new CreateJobUseCase(jobRepository, stockRepository);
    const { job } = await createUseCase.execute({
      productionUnitId,
      dateOfOpeation: new Date(),
      category: 'TREATMENT' as any,
      quantity: 5,
      unitOfMeasureQuantity: 'L',
      stocks: [
        {
          productId: product.id,
          quantity: -5,
          unitOfMeasureQuantity: 'L',
          price: 0,
          unitOfMeasurePrice: 'EUR',
          type: 'OUT',
        },
      ],
    });

    const listUseCase = new ListJobsForCurrentUserUseCase(jobRepository);
    const { jobs } = await listUseCase.execute({ userId: testUserId });
    const matching = jobs.find((entry) => entry.job.id === job.id);
    expect(matching).toBeDefined();
    expect(matching?.products).toEqual([
      {
        id: product.id,
        name: product.name,
        registrationNumber: product.registrationNumber,
      },
    ]);
  });
});
