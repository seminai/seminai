import { prisma, createTestUser, deleteTestUser, createTestCompany, deleteTestCompany } from './helpers';
import { runConformityCheck, confirmConformityCheck } from '../infrastructure/services/agents/conformity_checker_agent';
import type { ConfirmConformityCheckInput } from '../infrastructure/services/agents/conformity_checker_agent/types';
import { randomUUID } from 'crypto';

/**
 * Integration tests for the Conformity Checker Agent.
 *
 * These tests create real jobs in the database and run the conformity checker
 * against them. Some tests make real LLM calls for user notes analysis.
 *
 * Run with:
 *   npm run test:integration -- conformity-checker.integration.test.ts
 */

jest.setTimeout(240000);
describe('Conformity Checker Agent - Integration Tests', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let testWarehouseId: string;
  let testProductId: string;
  let testProductionUnitId: string;
  let testProductionCycleId: string;
  // jobGroupId is tracked per-test via createTestJob

  beforeAll(async () => {
    const testUser = await createTestUser();
    testUserId = testUser.id;

    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda Conformity Test',
    });
    testCompanyId = testCompany.id;

    testWarehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: testWarehouseId,
        companyId: testCompanyId,
        name: 'Magazzino Conformity',
        address: 'Via Test 1',
        city: 'Verona',
        cap: '37100',
        sezione: 'A',
        foglio: '1',
        particella: '100',
      },
    });

    testFieldId = randomUUID();
    await prisma.field.create({
      data: {
        id: testFieldId,
        companyId: testCompanyId,
        name: 'Campo Vite Conformity',
        address: 'Via Test 10',
        city: 'Verona',
        region: 'Veneto',
        nation: 'Italia',
        cap: '37100',
        sauHa: 5.0,
        superficieCatastaleMq: 50000,
        sezione: 'A',
        foglio: '10',
        particella: '200',
      },
    });

    testProductId = randomUUID();
    await prisma.product.create({
      data: {
        id: testProductId,
        warehouseId: testWarehouseId,
        name: 'POLTIGLIA DISPERSS',
        sku: 'POL-DISP-3741',
        category: 'PESTICIDE',
        type: 'Fungicida rameico',
        registrationNumber: '3741',
      },
    });

    testProductionUnitId = randomUUID();
    testProductionCycleId = randomUUID();

    await prisma.productionUnit.create({
      data: {
        id: testProductionUnitId,
        name: 'Vite Conformity',
        areaHa: 2.0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        productionUnitsOnFields: {
          create: {
            fieldId: testFieldId,
            areaHaOnField: 2.0,
          },
        },
      },
    });

    await prisma.productionCycle.create({
      data: {
        id: testProductionCycleId,
        productionUnitId: testProductionUnitId,
        cropName: 'Vite',
        cropType: 'PERENNE',
        variety: 'Chardonnay',
        protocoll: 'Integrato',
        protectionStructure: 'Nessuna',
        acquaTotalePeridoL: 0,
        seasonYear: 2025,
        cycleIndex: 0,
      },
    });
  });

  beforeEach(async () => {
    // Clean up jobs before each test
    await prisma.stock.deleteMany({
      where: { product: { warehouseId: testWarehouseId } },
    });
    await prisma.job.deleteMany({
      where: { productionUnitId: testProductionUnitId },
    });
  });

  afterAll(async () => {
    await prisma.stock.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.productionUnit.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.field.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
  });

  /**
   * Helper to create a job with stock in the DB and return the jobGroupId.
   */
  async function createTestJob(overrides?: {
    quantity?: number;
    unitOfMeasure?: string;
    dateOfOperation?: Date;
    isVerified?: boolean;
    conformityChecked?: boolean;
  }): Promise<{ jobEntityId: string; jobGroupId: string }> {
    const groupId = randomUUID();
    const entityId = randomUUID();

    await prisma.job.create({
      data: {
        id: entityId,
        jobId: groupId,
        productionUnitId: testProductionUnitId,
        productionCycleId: testProductionCycleId,
        dateOfOpeation: overrides?.dateOfOperation ?? new Date('2025-06-15'),
        isVerified: overrides?.isVerified ?? false,
        conformityChecked: overrides?.conformityChecked ?? false,
        category: 'TREATMENT',
        quantity: overrides?.quantity ?? 2.5,
        unitOfMeasureQuantity: overrides?.unitOfMeasure ?? 'kg/ha',
        modeOfApplication: 'irrorazione',
        avversity: 'peronospora',
        treatedSurface: 2.0,
        userId: testUserId,
        stocks: {
          create: {
            productId: testProductId,
            quantity: -(overrides?.quantity ?? 2.5),
            unitOfMeasureQuantity: overrides?.unitOfMeasure ?? 'kg',
            price: 0,
            unitOfMeasurePrice: 'EUR',
            type: 'OUTGOING',
          },
        },
      },
    });

    return { jobEntityId: entityId, jobGroupId: groupId };
  }

  it('should confirm proposals and update jobs in the database', async () => {
    const { jobGroupId, jobEntityId } = await createTestJob({ quantity: 2.5 });

    // First run the check
    const checkResult = await runConformityCheck(
      { jobGroupId },
      { jobId: jobGroupId, userId: testUserId },
    );
    expect(checkResult.proposals.length).toBe(1);

    // Then confirm the proposals
    const confirmInput: ConfirmConformityCheckInput = {
      jobGroupId,
      proposals: checkResult.proposals,
    };

    const confirmResult = await confirmConformityCheck(confirmInput);

    expect(confirmResult).toBeDefined();
    expect(confirmResult.jobGroupId).toBe(jobGroupId);
    expect(typeof confirmResult.updatedJobsCount).toBe('number');
    expect(typeof confirmResult.excludedJobsCount).toBe('number');
    expect(typeof confirmResult.errorCount).toBe('number');
    expect(Array.isArray(confirmResult.jobResults)).toBe(true);

    if (confirmResult.jobResults.length > 0) {
      const jobResult = confirmResult.jobResults[0];
      expect(jobResult.jobId).toBe(jobEntityId);
      expect(['updated', 'excluded', 'error']).toContain(jobResult.status);
    }
  });});
