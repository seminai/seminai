import { ProductCategory } from '@prisma/client';
import { fillTheJob } from '../infrastructure/services/agents/dosage_agent/fillTheJob';
import { JobHistoryManager } from '../infrastructure/services/agents/dosage_agent/historyCollector';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { CreateProductionUnitUseCase } from '../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { Field } from '../domain/entities/Field';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { CreateProductUseCase } from '../application/use-cases/product/CreateProductUseCase';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteAllTestCompanies } from './helpers';
import type { InputDosageAgent } from '../infrastructure/services/agents/dosage_agent';
import type { UnitAllowedProductsWithDosageOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';

describe('fillTheJob product reuse', () => {
  const EXISTING_PRODUCT_NAME = 'Contor';
  const EXISTING_PRODUCT_REGISTRATION = '16837';

  let testUserId: string;
  let companyId: string;
  let productionUnitId: string;
  let warehouseId: string;
  let existingProductId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    testUserId = user.id!;
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);
    const company = await createTestCompany({ userId: testUserId });
    companyId = company.id!;

    const fieldRepo = new PrismaFieldRepository(prisma);
    const puRepo = new PrismaProductionUnitRepository(prisma);
    const createProductionUnit = new CreateProductionUnitUseCase(puRepo, fieldRepo);

    const fieldEntity = Field.create({
      companyId,
      name: `Field-${Date.now()}`,
      coordinates: [],
      latitude: null,
      longitude: null,
      polygon: null,
      gisHa: null,
      sauHa: 2,
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
      nation: 'Italia',
      region: 'Lazio',
      city: 'Roma',
      address: 'Via Test 1',
      cap: '00100',
      variazioneMq: null,
      inizioConduzione: null,
      fineConduzione: null,
      bufferZoneNotes: null,
    });
    const createdField = await fieldRepo.create(fieldEntity);

    const now = new Date('2025-02-01T00:00:00.000Z');
    const unit = await createProductionUnit.execute({
      allocations: [{ fieldId: createdField.id, areaHa: 2 }],
      name: 'PU-Test',
      cropName: 'Test Crop',
      cropType: 'Test Crop',
      variety: 'Var 1',
      protocoll: 'P',
      areaHa: 2,
      protectionStructure: 'N',
      startDate: now,
      floweringDate: new Date(now.getTime() + 7 * 86400000),
      harvestingDate: new Date(now.getTime() + 30 * 86400000),
      endDate: new Date(now.getTime() + 60 * 86400000),
      acquaTotalePeridoL: 10,
    });
    productionUnitId = unit.productionUnit.id;

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId,
        name: `Warehouse-${Date.now()}`,
        nation: 'Italia',
        region: 'Lazio',
        city: 'Roma',
        address: 'Via Magazzino 1',
        cap: '00100',
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: '1',
      },
    });
    warehouseId = warehouse.id;

    const productRepository = new PrismaProductRepository(prisma);
    const stockRepository = new PrismaStockRepository(prisma);
    const createProduct = new CreateProductUseCase(productRepository, stockRepository);
    const { product } = await createProduct.execute({
      warehouseId,
      name: EXISTING_PRODUCT_NAME,
      sku: `SKU-${EXISTING_PRODUCT_REGISTRATION}`,
      category: ProductCategory.PESTICIDE,
      type: 'Fitosanitario',
      registrationNumber: EXISTING_PRODUCT_REGISTRATION,
      stock: null,
    });
    existingProductId = product.id;
  });

  afterEach(async () => {
    await deleteAllTestCompanies(testUserId);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it('reuses an existing product when name and registration number match within the company', async () => {
    const historyManager = new JobHistoryManager();
    const requestedProducts: InputDosageAgent['products'] = [
      {
        productName: `  ${EXISTING_PRODUCT_NAME} `,
        registrationNumber: `00${EXISTING_PRODUCT_REGISTRATION}`,
        quantity: 5,
        quantityUnitOfMeasure: 'kg',
      } as InputDosageAgent['products'][number],
    ];

    const units: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      {
        unitProductionId: productionUnitId,
        cropName: 'Test Crop',
        variety: 'Var 1',
        areaHa: 2,
        jobs: [],
        products: [
          {
            name: ` ${EXISTING_PRODUCT_NAME} `,
            regNumber: `00${EXISTING_PRODUCT_REGISTRATION}`,
            status: 'cached',
            quantity: 5,
            quantityUnitOfMeasure: 'kg',
            loadWarehouse: false,
            trattamenti: [
              {
                data_distribuzione: new Date('2025-02-10T00:00:00.000Z'),
                dose: 1.2,
                dosaggio_um: 'kg/ha',
                note: 'Test trattamento',
              },
            ],
          } as UnitAllowedProductsWithDosageOutput['products'][number],
        ],
      },
    ];

    const result = await fillTheJob({
      units,
      requestedProducts,
      historyManager,
    });

    const jobsForUnit = result.jobsByUnit.get(productionUnitId) ?? [];
    expect(jobsForUnit.length).toBe(1);
    expect(jobsForUnit[0].stocks).toHaveLength(1);
    expect(jobsForUnit[0].stocks[0].product.id).toBe(existingProductId);

    const productsInWarehouse = await prisma.product.findMany({
      where: { warehouseId, registrationNumber: EXISTING_PRODUCT_REGISTRATION },
    });
    expect(productsInWarehouse).toHaveLength(1);
    expect(productsInWarehouse[0].id).toBe(existingProductId);
  });

  it('reuses an existing product when only the name matches within the company', async () => {
    const historyManager = new JobHistoryManager();
    const requestedProducts: InputDosageAgent['products'] = [
      {
        productName: EXISTING_PRODUCT_NAME.toUpperCase(),
        registrationNumber: '0000',
        quantity: 2,
        quantityUnitOfMeasure: 'kg',
      } as InputDosageAgent['products'][number],
    ];

    const units: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      {
        unitProductionId: productionUnitId,
        cropName: 'Test Crop',
        variety: 'Var 1',
        areaHa: 1,
        jobs: [],
        products: [
          {
            name: EXISTING_PRODUCT_NAME.toLowerCase(),
            regNumber: '99999',
            status: 'cached',
            quantity: 2,
            quantityUnitOfMeasure: 'kg',
            loadWarehouse: false,
            trattamenti: [
              {
                data_distribuzione: new Date('2025-02-12T00:00:00.000Z'),
                dose: 1,
                dosaggio_um: 'kg/ha',
                note: 'Test solo nome',
              },
            ],
          } as UnitAllowedProductsWithDosageOutput['products'][number],
        ],
      },
    ];

    const result = await fillTheJob({
      units,
      requestedProducts,
      historyManager,
    });

    const jobsForUnit = result.jobsByUnit.get(productionUnitId) ?? [];
    expect(jobsForUnit.length).toBe(1);
    expect(jobsForUnit[0].stocks[0].product.id).toBe(existingProductId);

    const productsInWarehouse = await prisma.product.findMany({
      where: { warehouseId, name: { equals: EXISTING_PRODUCT_NAME, mode: 'insensitive' } },
    });
    expect(productsInWarehouse).toHaveLength(1);
  });

  it('does not create jobs when areaHa is missing or 0', async () => {
    const historyManager = new JobHistoryManager();
    const requestedProducts: InputDosageAgent['products'] = [
      {
        productName: EXISTING_PRODUCT_NAME,
        registrationNumber: EXISTING_PRODUCT_REGISTRATION,
        quantity: 5,
        quantityUnitOfMeasure: 'kg',
      } as InputDosageAgent['products'][number],
    ];

    const buildUnit = (areaHa: number | undefined): UnitAllowedProductsWithDosageOutput => {
      return {
        unitProductionId: productionUnitId,
        cropName: 'Test Crop',
        variety: 'Var 1',
        areaHa,
        jobs: [],
        products: [
          {
            name: EXISTING_PRODUCT_NAME,
            regNumber: EXISTING_PRODUCT_REGISTRATION,
            status: 'cached',
            quantity: 5,
            quantityUnitOfMeasure: 'kg',
            loadWarehouse: false,
            trattamenti: [
              {
                data_distribuzione: new Date('2025-02-15T00:00:00.000Z'),
                dose: 1,
                dosaggio_um: 'kg/ha',
                note: 'Test areaHa missing/zero',
              },
            ],
          } as UnitAllowedProductsWithDosageOutput['products'][number],
        ],
      };
    };

    const resultMissing = await fillTheJob({
      units: [buildUnit(undefined)],
      requestedProducts,
      historyManager,
    });
    const jobsMissing = resultMissing.jobsByUnit.get(productionUnitId) ?? [];
    expect(jobsMissing.length).toBe(0);
    expect(resultMissing.warnings.join(' ')).toContain('missing or non-positive areaHa');

    const resultZero = await fillTheJob({
      units: [buildUnit(0)],
      requestedProducts,
      historyManager,
    });
    const jobsZero = resultZero.jobsByUnit.get(productionUnitId) ?? [];
    expect(jobsZero.length).toBe(0);
    expect(resultZero.warnings.join(' ')).toContain('missing or non-positive areaHa');
  });
});
