import { prisma, createTestUser, deleteTestUser, createTestCompany, deleteTestCompany } from './helpers';
import { runConformityCheck } from '../infrastructure/services/agents/conformity_checker_agent';
import type { ConformityCheckInput } from '../infrastructure/services/agents/conformity_checker_agent/types';
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

  it('should run conformity check on a single job and return structured output', async () => {
    const { jobGroupId } = await createTestJob();

    const input: ConformityCheckInput = {
      jobGroupId,
    };

    const result = await runConformityCheck(input, {
      jobId: jobGroupId,
      userId: testUserId,
    });

    expect(result).toBeDefined();
    expect(result.jobGroupId).toBe(jobGroupId);
    expect(result.proposals).toBeDefined();
    expect(Array.isArray(result.proposals)).toBe(true);
    expect(result.proposals.length).toBe(1);

    const proposal = result.proposals[0];
    expect(proposal.productionUnitId).toBe(testProductionUnitId);
    expect(proposal.productName).toBeDefined();
    expect(typeof proposal.isConform).toBe('boolean');
    expect(Array.isArray(proposal.violations)).toBe(true);
    expect(proposal.originalValues).toBeDefined();
    expect(proposal.proposedValues).toBeDefined();

    // Verify summary structure
    expect(result.summary).toBeDefined();
    expect(result.summary.totalJobs).toBe(1);
    expect(typeof result.summary.conformJobs).toBe('number');
    expect(typeof result.summary.nonConformJobs).toBe('number');
    expect(typeof result.summary.totalViolations).toBe('number');
    expect(result.checkedAt).toBeInstanceOf(Date);
  });

  it('should detect already-checked jobs and skip them', async () => {
    const { jobGroupId } = await createTestJob({
      conformityChecked: true,
      isVerified: true,
    });

    const input: ConformityCheckInput = {
      jobGroupId,
    };

    const result = await runConformityCheck(input, {
      jobId: jobGroupId,
      userId: testUserId,
    });

    expect(result).toBeDefined();
    // Already-checked jobs may be skipped entirely (no proposals) or flagged
    expect(result.summary.alreadyCheckedJobs).toBe(1);
    // The checker skips already-checked jobs, so proposals array may be empty
    expect(result.proposals.length).toBe(0);
  });

  it('should handle non-existent job group gracefully', async () => {
    const fakeGroupId = randomUUID();
    const input: ConformityCheckInput = {
      jobGroupId: fakeGroupId,
    };

    const result = await runConformityCheck(input, {
      jobId: fakeGroupId,
      userId: testUserId,
    });

    expect(result).toBeDefined();
    expect(result.summary.totalJobs).toBe(0);
    expect(result.proposals.length).toBe(0);
  });});
