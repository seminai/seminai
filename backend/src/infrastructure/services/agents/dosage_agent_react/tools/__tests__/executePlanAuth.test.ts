/**
 * Unit tests for the strict userId requirement and UPFRONT productionUnit
 * authorization on execute_treatment_plan (PR-C of P2).
 * Covers: factory signature contract, foreign PU rejection (incl. dryRun),
 * audit log emission on success.
 */
import { createExecutePlanTool } from '../execute-plan.tool';
import { assertProductionUnitsAccess } from '../authorization';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../../working-memory';
import { fillTheJob } from '../../../dosage_agent/fillTheJob';
import { PrismaDosageAgentJobRepository } from '../../../../../repositories/PrismaDosageAgentJobRepository';
import { DosageAgentJobState } from '../../../../../../domain/entities/DosageAgentJob';

const mockDosageAgentJobUpdateStatus = jest.fn();

jest.mock('../authorization', () => ({
  assertProductionUnitsAccess: jest.fn(),
}));

jest.mock('../../working-memory', () => ({
  getWorkingMemory: jest.fn(),
  updateWorkingMemory: jest.fn(),
  hasWorkingMemoryData: jest.fn(),
}));

jest.mock('../../../dosage_agent/fillTheJob', () => ({
  fillTheJob: jest.fn(),
}));

jest.mock('../../../dosage_agent/historyCollector', () => ({
  JobHistoryManager: jest.fn(() => ({})),
}));

jest.mock('../../../../../repositories/Prisma', () => ({
  prisma: {},
}));

jest.mock('../../../../../repositories/PrismaDosageAgentJobRepository', () => ({
  PrismaDosageAgentJobRepository: jest.fn().mockImplementation(() => ({
    updateStatus: mockDosageAgentJobUpdateStatus,
  })),
}));

const mockedAssertProductionUnitsAccess = assertProductionUnitsAccess as jest.MockedFunction<
  typeof assertProductionUnitsAccess
>;
const mockedGetWorkingMemory = getWorkingMemory as jest.MockedFunction<typeof getWorkingMemory>;
const mockedHasWorkingMemoryData = hasWorkingMemoryData as jest.MockedFunction<
  typeof hasWorkingMemoryData
>;
const mockedUpdateWorkingMemory = updateWorkingMemory as jest.MockedFunction<
  typeof updateWorkingMemory
>;
const mockedFillTheJob = fillTheJob as jest.MockedFunction<typeof fillTheJob>;
const MockedPrismaDosageAgentJobRepository = PrismaDosageAgentJobRepository as jest.Mock;
const OWN_UNIT_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_UNIT_ID_1 = '22222222-2222-4222-8222-222222222222';
const FOREIGN_UNIT_ID_2 = '33333333-3333-4333-8333-333333333333';

function seedWorkingMemory(unitProductionIds: string[]): void {
  mockedHasWorkingMemoryData.mockReturnValue(true);
  mockedGetWorkingMemory.mockReturnValue({
    activePlan: {
      id: 'plan-1',
      status: 'approved',
      steps: [
        {
          sequence: 1,
          status: 'approved',
          treatment: {
            productName: 'Rame',
            applicationDate: '2026-06-01',
            dosePerHa: 1.5,
            doseUnit: 'kg/ha',
          },
        },
      ],
      metadata: { updatedAt: '2026-05-23T00:00:00.000Z' },
    },
    dosageResults: unitProductionIds.map((id) => ({
      unitProductionId: id,
      products: [{ trattamenti: [{ sequence: 1 }] }],
    })),
  } as never);
}

describe('execute_treatment_plan — strict authorization (PR-C)', () => {
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    mockedAssertProductionUnitsAccess.mockReset();
    mockedGetWorkingMemory.mockReset();
    mockedHasWorkingMemoryData.mockReset();
    mockedUpdateWorkingMemory.mockReset();
    mockedFillTheJob.mockReset();
    mockDosageAgentJobUpdateStatus.mockReset();
    mockDosageAgentJobUpdateStatus.mockResolvedValue({});
    MockedPrismaDosageAgentJobRepository.mockClear();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it('factory signature requires userId at compile time (TS-enforced)', () => {
    // @ts-expect-error userId is required in PR-C signature
    const willFail = () => createExecutePlanTool('thread-1');
    // Runtime still constructs the tool (TS is the contract), but a TS-only
    // codebase rejects the missing argument at build. This test documents the
    // intent and breaks if someone reverts the signature to optional.
    expect(typeof willFail).toBe('function');

    const ok = createExecutePlanTool('thread-1', 'user-1');
    expect(ok.name).toBe('execute_treatment_plan');
  });

  it('foreign productionUnitId in dosageResults: throws upfront, dryRun does NOT leak the summary, fillTheJob never called', async () => {
    seedWorkingMemory([FOREIGN_UNIT_ID_1, FOREIGN_UNIT_ID_2]);
    mockedAssertProductionUnitsAccess.mockRejectedValueOnce(
      new Error('Una o più unità produttive non sono autorizzate per questo utente (2).'),
    );

    const tool = createExecutePlanTool('thread-1', 'user-1');
    const raw = await tool.func({ dryRun: true });
    const out = JSON.parse(raw as string);

    expect(out.error).toMatch(/non.*autorizzate/);
    expect(out.dryRun).toBeUndefined();
    expect(out.steps).toBeUndefined();
    expect(mockedAssertProductionUnitsAccess).toHaveBeenCalledWith('user-1', [
      FOREIGN_UNIT_ID_1,
      FOREIGN_UNIT_ID_2,
    ]);
    expect(mockedFillTheJob).not.toHaveBeenCalled();
  });

  it('non-UUID productionUnitId in dosageResults: blocks with invalid reference before authorization', async () => {
    seedWorkingMemory(['vite']);

    const tool = createExecutePlanTool('thread-1', 'user-1');
    const raw = await tool.func({ dryRun: true });
    const out = JSON.parse(raw as string);

    expect(out.code).toBe('INVALID_PRODUCTION_UNIT_REFERENCE');
    expect(out.blocked).toBe(true);
    expect(out.invalidUnitCount).toBe(1);
    expect(out.error).toMatch(/riferimento unita produttiva non valido/i);
    expect(mockedAssertProductionUnitsAccess).not.toHaveBeenCalled();
    expect(mockedFillTheJob).not.toHaveBeenCalled();
  });

  it('own productionUnitIds OK: emits audit log and proceeds (dryRun path)', async () => {
    seedWorkingMemory([OWN_UNIT_ID]);
    mockedAssertProductionUnitsAccess.mockResolvedValueOnce(undefined);

    const tool = createExecutePlanTool('thread-1', 'user-1');
    const raw = await tool.func({ dryRun: true });
    const out = JSON.parse(raw as string);

    expect(mockedAssertProductionUnitsAccess).toHaveBeenCalledWith('user-1', [OWN_UNIT_ID]);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[execute_plan] audit',
      expect.objectContaining({
        userId: 'user-1',
        planId: 'plan-1',
        productionUnitIds: [OWN_UNIT_ID],
        dryRun: true,
      }),
    );
    expect(out.dryRun).toBe(true);
    expect(out.stepsToExecute).toBe(1);
    expect(mockedFillTheJob).not.toHaveBeenCalled(); // dryRun does not invoke
  });

  it('without queueJobId: creates a completed archive group and saves all operations with that groupJobId', async () => {
    seedWorkingMemory([OWN_UNIT_ID]);
    mockedAssertProductionUnitsAccess.mockResolvedValueOnce(undefined);
    mockedFillTheJob.mockResolvedValueOnce({
      jobsByUnit: new Map([[OWN_UNIT_ID, [{ id: 'job-1' }, { id: 'job-2' }]]]),
      warnings: [],
    } as never);

    const tool = createExecutePlanTool('thread-1', 'user-1');
    const raw = await tool.func({ dryRun: false });
    const out = JSON.parse(raw as string);

    expect(out.archiveGroupCreated).toBe(true);
    expect(out.groupJobId).toMatch(/^chat-thread-1-\d{14}-[0-9a-f]{8}$/);
    expect(out.totalJobsCreated).toBe(2);
    expect(out.operationCount).toBe(2);
    expect(out.archiveOperationsCount).toBe(2);
    expect(mockedFillTheJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueJobId: out.groupJobId,
      }),
    );
    expect(mockDosageAgentJobUpdateStatus).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        jobId: out.groupJobId,
        userId: 'user-1',
        state: DosageAgentJobState.ACTIVE,
        progress: 0,
        failedReason: null,
        processedOn: expect.any(Date),
        name: expect.stringContaining('Piano chat'),
      }),
    );
    expect(mockDosageAgentJobUpdateStatus).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        jobId: out.groupJobId,
        userId: 'user-1',
        state: DosageAgentJobState.COMPLETED,
        progress: 100,
        failedReason: null,
        finishedOn: expect.any(Date),
        name: expect.stringContaining('Piano chat'),
      }),
    );
  });

  it('with queueJobId: uses the existing archive group and does not create a new DosageAgentJob row', async () => {
    seedWorkingMemory([OWN_UNIT_ID]);
    mockedAssertProductionUnitsAccess.mockResolvedValueOnce(undefined);
    mockedFillTheJob.mockResolvedValueOnce({
      jobsByUnit: new Map([[OWN_UNIT_ID, [{ id: 'job-1' }]]]),
      warnings: [],
    } as never);

    const tool = createExecutePlanTool('thread-1', 'user-1');
    const raw = await tool.func({ dryRun: false, queueJobId: ' existing-group-1 ' });
    const out = JSON.parse(raw as string);

    expect(out.archiveGroupCreated).toBe(false);
    expect(out.groupJobId).toBe('existing-group-1');
    expect(out.totalJobsCreated).toBe(1);
    expect(mockedFillTheJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueJobId: 'existing-group-1',
      }),
    );
    expect(mockDosageAgentJobUpdateStatus).not.toHaveBeenCalled();
  });
});
