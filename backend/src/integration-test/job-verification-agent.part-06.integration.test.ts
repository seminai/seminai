import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { prisma, createTestUser, deleteTestUser, createTestCompany, deleteTestCompany } from './helpers';
import { createJobVerificationAgentApp, handleJobVerificationMessage, getJobVerificationAgentState } from '../infrastructure/services/agents/job_agent';
import type { JobWithAssignmentDTO } from '../domain/dtos/job-assignment.dto';
import { Job } from '../domain/entities/Job';
import { JobCategory } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * Integration tests for the Job Verification Agent.
 *
 * These tests make real LLM calls to OpenAI GPT-4o.
 * Expected time: ~2-3 minutes per test.
 *
 * Run with:
 *   npm run test:integration -- job-verification-agent.integration.test.ts
 */

jest.setTimeout(240000);
describe('Job Verification Agent - Integration Tests', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let testWarehouseId: string;
  let testProductId: string;
  let testProductionUnitId: string;
  let testProductionCycleId: string;
  let testJobId: string;
  let testJobEntityId: string;

  /**
   * Builds a JobWithAssignmentDTO for testing.
   */
  function buildTestJobAssignment(
    overrides?: Partial<{
      jobQuantity: number;
      unitOfMeasure: string;
      cropName: string;
      productName: string;
      registrationNumber: string | null;
      dateOfOperation: Date;
    }>,
  ): JobWithAssignmentDTO {
    const job = new Job(
      testJobEntityId,
      testJobId,
      testProductionUnitId,
      testProductionCycleId,
      overrides?.dateOfOperation ?? new Date('2025-06-15'),
      false,
      false,
      JobCategory.TREATMENT,
      overrides?.jobQuantity ?? 2.5,
      overrides?.unitOfMeasure ?? 'kg/ha',
      null,
      null,
      'irrorazione',
      'peronospora',
      null,
      1.5,
      false,
      testUserId,
      null,
      null,
      null,
      null,
      null,
      null,
      new Date(),
      new Date(),
    );

    return {
      job,
      productionUnit: {
        id: testProductionUnitId,
        name: overrides?.cropName ?? 'Vite Chardonnay',
        cropName: overrides?.cropName ?? 'Vite',
        cropType: 'PERENNE',
        sauHa: 1.5,
      },
      products: [
        {
          id: testProductId,
          name: overrides?.productName ?? 'POLTIGLIA DISPERSS',
          registrationNumber: overrides?.registrationNumber ?? '3741',
        },
      ],
      fields: [
        {
          id: testFieldId,
          name: 'Campo Vite Nord',
        },
      ],
      company: {
        id: testCompanyId,
        name: 'Azienda Agricola Test',
      },
      machine: null,
    };
  }

  beforeAll(async () => {
    const testUser = await createTestUser();
    testUserId = testUser.id;

    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda Agricola Test',
    });
    testCompanyId = testCompany.id;

    testWarehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: testWarehouseId,
        companyId: testCompanyId,
        name: 'Magazzino Test',
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
        name: 'Campo Vite Nord',
        address: 'Via Vigneto 10',
        city: 'Verona',
        region: 'Veneto',
        nation: 'Italia',
        cap: '37100',
        sauHa: 5.0,
        superficieCatastaleMq: 50000,
        sezione: 'A',
        foglio: '10',
        particella: '250',
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
        name: 'Vite Chardonnay',
        areaHa: 1.5,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        productionUnitsOnFields: {
          create: {
            fieldId: testFieldId,
            areaHaOnField: 1.5,
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

    testJobId = randomUUID();
    testJobEntityId = randomUUID();

    await prisma.job.create({
      data: {
        id: testJobEntityId,
        jobId: testJobId,
        productionUnitId: testProductionUnitId,
        productionCycleId: testProductionCycleId,
        dateOfOpeation: new Date('2025-06-15'),
        isVerified: false,
        conformityChecked: false,
        category: 'TREATMENT',
        quantity: 2.5,
        unitOfMeasureQuantity: 'kg/ha',
        modeOfApplication: 'irrorazione',
        avversity: 'peronospora',
        treatedSurface: 1.5,
        userId: testUserId,
        stocks: {
          create: {
            productId: testProductId,
            quantity: -2.5,
            unitOfMeasureQuantity: 'kg',
            price: 0,
            unitOfMeasurePrice: 'EUR',
            type: 'OUTGOING',
          },
        },
      },
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

  it('should return state with correct structure', async () => {
    const app = createJobVerificationAgentApp({
      modelName: LIVE_TEST_CHAT_MODEL,
      temperature: 0,
      userId: testUserId,
    });
    const threadId = randomUUID();
    const jobAssignment = buildTestJobAssignment();

    await handleJobVerificationMessage(app, threadId, {
      jobs: [jobAssignment],
      message: 'Dimmi qualcosa sul trattamento.',
    });

    const state = await getJobVerificationAgentState(app, threadId);
    expect(state).toBeDefined();
    expect(state.messages).toBeDefined();
    expect(Array.isArray(state.messages)).toBe(true);
    expect(state.jobs).toBeDefined();
    expect(Array.isArray(state.tasks)).toBe(true);
    expect(Array.isArray(state.sources)).toBe(true);
    expect(typeof state.requiresHumanInput).toBe('boolean');
  });});
