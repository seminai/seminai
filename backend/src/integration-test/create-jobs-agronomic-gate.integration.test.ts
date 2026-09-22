/**
 * Integration tests for the deterministic agronomic gate (P0/P1).
 *
 * Exercises the REAL chain: create_treatment_jobs / validate_agronomic_plan
 * tools → agronomicPlanInputBuilder → domain validator → gate, against a REAL
 * DB-owned production unit (so assertProductionUnitsAccess passes) and the REAL
 * ministerial revoked dataset. dosageResults are seeded into working memory —
 * that is the contract boundary the upstream LLM/BDF tools produce.
 *
 * Per eseguire (DB di test isolato via Docker, no LLM):
 *   npm run test:int:fast:env -- --testPathPattern create-jobs-agronomic-gate
 */

import { ProductCategory } from '@prisma/client';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteAllTestCompanies } from './helpers';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { CreateProductionUnitUseCase } from '../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { Field } from '../domain/entities/Field';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { CreateProductUseCase } from '../application/use-cases/product/CreateProductUseCase';
import { createCreateJobsTool } from '../infrastructure/services/agents/dosage_agent_react/tools/create-jobs.tool';
import { createValidateAgronomicPlanTool } from '../infrastructure/services/agents/dosage_agent_react/tools/validate-agronomic-plan.tool';
import {
  updateWorkingMemory,
  clearWorkingMemory,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import type { UnitAllowedProductsWithDosageOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';

const PRODUCT_NAME = 'TestFungicida';
const PRODUCT_REGISTRATION = '99999';
const CROP = 'Pomodoro';
const HARVEST = new Date('2026-08-30T00:00:00.000Z');

describe('Agronomic gate — create_treatment_jobs', () => {
  let testUserId: string;
  let companyId: string;
  let productionUnitId: string;
  let warehouseId: string;

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
    const field = await fieldRepo.create(
      Field.create({
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
      }),
    );
    const unit = await createProductionUnit.execute({
      allocations: [{ fieldId: field.id, areaHa: 2 }],
      name: 'PU-Gate',
      cropName: CROP,
      cropType: CROP,
      variety: 'Var 1',
      protocoll: 'P',
      areaHa: 2,
      protectionStructure: 'N',
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      floweringDate: new Date('2026-06-01T00:00:00.000Z'),
      harvestingDate: HARVEST,
      endDate: new Date('2026-09-30T00:00:00.000Z'),
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

    const createProduct = new CreateProductUseCase(
      new PrismaProductRepository(prisma),
      new PrismaStockRepository(prisma),
    );
    await createProduct.execute({
      warehouseId,
      name: PRODUCT_NAME,
      sku: `SKU-${PRODUCT_REGISTRATION}`,
      category: ProductCategory.PESTICIDE,
      type: 'Fitosanitario',
      registrationNumber: PRODUCT_REGISTRATION,
      stock: null,
    });
  });

  afterEach(async () => {
    await deleteAllTestCompanies(testUserId);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  function buildUnit(params: {
    readonly dose: number;
    readonly applicationDate: Date;
  }): UnitAllowedProductsWithDosageOutput {
    return {
      unitProductionId: productionUnitId,
      cropName: CROP,
      variety: 'Var 1',
      areaHa: 2,
      harvestingDate: HARVEST,
      jobs: [],
      products: [
        {
          name: PRODUCT_NAME,
          regNumber: PRODUCT_REGISTRATION,
          status: 'cached',
          quantity: 5,
          quantityUnitOfMeasure: 'kg',
          loadWarehouse: false,
          label: {
            dosaggi_dettagliati: [
              {
                coltura: CROP,
                dose_minima: 0.8,
                dose_massima: 1.5,
                dose_um: 'kg/ha',
                intervallo_sicurezza_giorni: 14,
              },
            ],
          },
          trattamenti: [
            {
              data_distribuzione: params.applicationDate,
              dose: params.dose,
              dosaggio_um: 'kg/ha',
              note: 'Test',
            },
          ],
        } as unknown as UnitAllowedProductsWithDosageOutput['products'][number],
      ],
    } as unknown as UnitAllowedProductsWithDosageOutput;
  }

  function seed(threadId: string, dose: number, applicationDate: Date): void {
    updateWorkingMemory(threadId, {
      dosageResults: [buildUnit({ dose, applicationDate })],
      inputProducts: [
        {
          productName: PRODUCT_NAME,
          registrationNumber: PRODUCT_REGISTRATION,
          quantity: 5,
          quantityUnitOfMeasure: 'kg',
        },
      ],
    });
  }

  it('validate_agronomic_plan flags a dose above the label maximum as BLOCKING', async () => {
    const threadId = `gate-validate-${Date.now()}`;
    seed(threadId, 5.0, new Date('2026-06-15T00:00:00.000Z'));
    const tool = createValidateAgronomicPlanTool(threadId);

    const result = JSON.parse(await tool.func({}));

    expect(result.blockingCount).toBeGreaterThanOrEqual(1);
    expect(result.violations.map((v: { code: string }) => v.code)).toContain(
      'DOSE_ABOVE_LABEL_MAX',
    );
    clearWorkingMemory(threadId);
  });

  it('flags a PHI violation when the treatment is too close to harvest', async () => {
    const threadId = `gate-phi-${Date.now()}`;
    // 1.0 kg/ha is within range; application 2026-08-20 is 10 days before harvest (PHI 14).
    seed(threadId, 1.0, new Date('2026-08-20T00:00:00.000Z'));
    const tool = createValidateAgronomicPlanTool(threadId);

    const result = JSON.parse(await tool.func({}));

    expect(result.violations.map((v: { code: string }) => v.code)).toContain('PHI_VIOLATION');
    clearWorkingMemory(threadId);
  });

  it('create_treatment_jobs dry-run reports the agronomic blocking count', async () => {
    const threadId = `gate-dry-${Date.now()}`;
    seed(threadId, 5.0, new Date('2026-06-15T00:00:00.000Z'));
    const tool = createCreateJobsTool(threadId, testUserId);

    const result = JSON.parse(await tool.func({ persist: false }));

    expect(result.dryRun).toBe(true);
    expect(result.agronomicBlockingCount).toBeGreaterThanOrEqual(1);
    clearWorkingMemory(threadId);
  });

  it('BLOCKS persistence on a blocking violation and creates NO jobs', async () => {
    const threadId = `gate-block-${Date.now()}`;
    seed(threadId, 5.0, new Date('2026-06-15T00:00:00.000Z'));
    const tool = createCreateJobsTool(threadId, testUserId);

    const result = JSON.parse(await tool.func({ persist: true }));

    expect(result.blocked).toBe(true);
    expect(result.requiresOverride).toBe(true);
    const jobs = await prisma.job.count({ where: { productionUnitId } });
    expect(jobs).toBe(0);
    clearWorkingMemory(threadId);
  });

  it('PERSISTS when the blocking violation is explicitly overridden', async () => {
    const threadId = `gate-override-${Date.now()}`;
    seed(threadId, 5.0, new Date('2026-06-15T00:00:00.000Z'));
    const tool = createCreateJobsTool(threadId, testUserId);

    const result = JSON.parse(
      await tool.func({ persist: true, overrideViolationCodes: ['DOSE_ABOVE_LABEL_MAX'] }),
    );

    expect(result.blocked).toBeUndefined();
    expect(result.totalJobsCreated).toBeGreaterThanOrEqual(1);
    const jobs = await prisma.job.count({ where: { productionUnitId } });
    expect(jobs).toBeGreaterThanOrEqual(1);
    clearWorkingMemory(threadId);
  });

  it('PERSISTS a compliant plan without any override', async () => {
    const threadId = `gate-clean-${Date.now()}`;
    // 1.0 kg/ha within [0.8, 1.5]; application 2026-06-15 respects PHI (>14d before harvest).
    seed(threadId, 1.0, new Date('2026-06-15T00:00:00.000Z'));
    const tool = createCreateJobsTool(threadId, testUserId);

    const result = JSON.parse(await tool.func({ persist: true }));

    expect(result.blocked).toBeUndefined();
    expect(result.totalJobsCreated).toBeGreaterThanOrEqual(1);
    clearWorkingMemory(threadId);
  });
});
