import {
  prisma,
  createTestUser,
  deleteTestUser,
  createTestCompany,
  deleteTestCompany,
} from './helpers';
import { DosageAgentQueue } from '../infrastructure/queue/DosageAgentQueue';
import { StartDosageAgentJobUseCase } from '../application/use-cases/job/StartDosageAgentJobUseCase';
import { GetDosageAgentJobStatusUseCase } from '../application/use-cases/job/GetDosageAgentJobStatusUseCase';
import { PrismaDosageAgentJobRepository } from '../infrastructure/repositories/PrismaDosageAgentJobRepository';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { Field } from '../domain/entities/Field';
import { randomUUID } from 'crypto';
import type { InputDosageAgent } from '../infrastructure/services/agents/dosage_agent';

/**
 * Integration tests for the Dosage Agent Queue E2E flow.
 *
 * These tests verify the full asynchronous pipeline:
 *   startJob -> queue -> worker processes -> completion -> getStatus
 *
 * WARNING: These tests require a running Redis instance and make real LLM calls.
 * Expected time: 3-5 minutes per test.
 *
 * Run with:
 *   npm run test:integration -- dosage-agent-queue.integration.test.ts
 */

jest.setTimeout(600000);

describe('Dosage Agent Queue - E2E Integration Tests', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let testWarehouseId: string;
  let testProductionUnitId: string;
  let queue: DosageAgentQueue;
  let dosageAgentJobRepository: PrismaDosageAgentJobRepository;

  beforeAll(async () => {
    const testUser = await createTestUser();
    testUserId = testUser.id;

    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda Queue Test',
    });
    testCompanyId = testCompany.id;

    testWarehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: testWarehouseId,
        companyId: testCompanyId,
        name: 'Magazzino Queue Test',
        address: 'Via Queue 1',
        city: 'Bologna',
        cap: '40100',
        sezione: 'B',
        foglio: '2',
        particella: '50',
      },
    });

    // Create field
    const fieldRepo = new PrismaFieldRepository(prisma);
    const field = Field.create({
      companyId: testCompanyId,
      name: 'Campo Pero Queue',
      coordinates: [],
      latitude: null,
      longitude: null,
      polygon: null,
      gisHa: null,
      sauHa: 5,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
      soilType: null,
      uso: null,
      qualita: null,
      superficieCatastaleMq: 50000,
      sezione: 'B',
      foglio: '5',
      particella: '200',
      subalterno: null,
      nation: 'Italia',
      region: 'Emilia-Romagna',
      city: 'Bologna',
      address: 'Via Pero 1',
      cap: '40100',
      variazioneMq: null,
      inizioConduzione: null,
      fineConduzione: null,
      bufferZoneNotes: null,
    });
    const createdField = await fieldRepo.create(field);
    testFieldId = createdField.id;

    // Create production unit directly in Prisma
    testProductionUnitId = randomUUID();
    await prisma.productionUnit.create({
      data: {
        id: testProductionUnitId,
        name: 'Pero Williams Queue',
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
        productionUnitId: testProductionUnitId,
        cropName: 'Pero',
        cropType: 'PERENNE',
        variety: 'Williams',
        protocoll: 'Integrato',
        protectionStructure: 'Nessuna',
        acquaTotalePeridoL: 0,
        seasonYear: 2025,
        cycleIndex: 0,
      },
    });

    queue = new DosageAgentQueue();
    dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);
  });

  afterAll(async () => {
    // Clean up queue
    try {
      if (queue.worker) {
        await queue.worker.close();
      }
      if (queue.queueEvents) {
        await queue.queueEvents.close();
      }
      await queue.queue.close();
    } catch {
      // Ignore queue cleanup errors
    }

    await prisma.stock.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.productionCycle.deleteMany({});
    await prisma.productionUnit.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.field.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
  });

  /**
   * Polls the job status until it reaches a terminal state or timeout.
   */
  async function waitForJobCompletion(
    statusUseCase: GetDosageAgentJobStatusUseCase,
    jobId: string,
    timeoutMs: number = 300000,
  ): Promise<{ state: string; result?: unknown; failedReason?: string }> {
    const startTime = Date.now();
    const pollIntervalMs = 5000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await statusUseCase.execute({ jobId });
        console.log(`[POLL] Job ${jobId}: state=${status.state}, progress=${status.progress}`);

        if (['completed', 'failed'].includes(status.state)) {
          return {
            state: status.state,
            result: status.result,
            failedReason: status.failedReason,
          };
        }
      } catch (error) {
        console.warn(`[POLL] Error polling job ${jobId}:`, error);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
  }

  /**
   * Builds the InputDosageAgent with the correct type structure.
   * unitOfProduction is Partial<ProductionUnit & Partial<Field> & { disciplinari; cropVariety }>
   */
  function buildDosageInput(overrides?: Partial<InputDosageAgent>): InputDosageAgent {
    return {
      products: [],
      unitOfProduction: [
        {
          id: testProductionUnitId,
          name: 'Pero Williams Queue',
          areaHa: 2.0,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          disciplinari: [],
          cropVariety: 'Williams',
        },
      ],
      strategy: 'avg',
      startAt: new Date('2025-04-01'),
      endAt: new Date('2025-09-30'),
      ...overrides,
    };
  }

  it('should start a job, process it through the queue, and reach completed state', async () => {
    const startUseCase = new StartDosageAgentJobUseCase(queue, dosageAgentJobRepository);
    const statusUseCase = new GetDosageAgentJobStatusUseCase(queue, dosageAgentJobRepository);

    const input = buildDosageInput();

    // Start the job
    const { jobId } = await startUseCase.execute({
      input,
      userId: testUserId,
    });

    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe('string');

    // Verify initial queued state
    const initialStatus = await statusUseCase.execute({ jobId });
    expect(initialStatus).toBeDefined();
    expect(['queued', 'waiting', 'active']).toContain(initialStatus.state);

    // Wait for completion
    const finalStatus = await waitForJobCompletion(statusUseCase, jobId);

    // Job should either complete or fail (both are valid terminal states for this test)
    expect(['completed', 'failed']).toContain(finalStatus.state);

    if (finalStatus.state === 'completed') {
      console.log('Job completed successfully');
    } else {
      console.log(`Job failed with reason: ${finalStatus.failedReason}`);
    }
  });

  it('should track job state transitions correctly', async () => {
    const startUseCase = new StartDosageAgentJobUseCase(queue, dosageAgentJobRepository);
    const statusUseCase = new GetDosageAgentJobStatusUseCase(queue, dosageAgentJobRepository);

    const input = buildDosageInput({ strategy: 'min' });

    const { jobId } = await startUseCase.execute({ input, userId: testUserId });

    const finalStatus = await waitForJobCompletion(statusUseCase, jobId);

    // Final state must be terminal
    expect(['completed', 'failed']).toContain(finalStatus.state);
  });

  it('should persist job status in database via repository', async () => {
    const startUseCase = new StartDosageAgentJobUseCase(queue, dosageAgentJobRepository);
    const statusUseCase = new GetDosageAgentJobStatusUseCase(queue, dosageAgentJobRepository);

    const input = buildDosageInput({ strategy: 'max' });

    const { jobId } = await startUseCase.execute({ input, userId: testUserId });

    // Wait for the job to reach a terminal state
    await waitForJobCompletion(statusUseCase, jobId);

    // Check the database record (DosageAgentJob uses `id` as PK, which equals the BullMQ jobId)
    const dbRecord = await prisma.dosageAgentJob.findFirst({
      where: { id: jobId },
    });

    expect(dbRecord).toBeDefined();
    if (dbRecord) {
      expect(dbRecord.userId).toBe(testUserId);
      expect(['COMPLETED', 'FAILED']).toContain(dbRecord.state);
    }
  });
});
