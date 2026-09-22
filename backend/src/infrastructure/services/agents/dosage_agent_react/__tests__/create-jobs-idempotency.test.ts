jest.mock('../../../../repositories/Prisma', () => ({
  prisma: {
    job: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../dosage_agent/fillTheJob', () => ({
  fillTheJob: jest.fn(),
}));

import { prisma } from '../../../../repositories/Prisma';
import { fillTheJob } from '../../dosage_agent/fillTheJob';
import { createCreateJobsTool } from '../tools/create-jobs.tool';
import { clearWorkingMemory, updateWorkingMemory } from '../working-memory';

describe('create_treatment_jobs idempotency', () => {
  const threadId = 'jobs-thread';

  beforeEach(() => {
    clearWorkingMemory(threadId);
    jest.clearAllMocks();
    updateWorkingMemory(threadId, {
      dosageResults: [{ products: [] }] as unknown as [],
    });
  });

  it('reuses jobs already linked to the same queueJobId', async () => {
    (prisma.job.findMany as jest.Mock).mockResolvedValue([
      { id: 'job-1', productionUnitId: 'unit-1' },
      { id: 'job-2', productionUnitId: 'unit-1' },
      { id: 'job-3', productionUnitId: 'unit-2' },
    ]);
    const tool = createCreateJobsTool(threadId);

    const result = JSON.parse(await tool.func({ queueJobId: 'queue-1', persist: true }));

    expect(result.reusedExistingJobs).toBe(true);
    expect(result.totalJobsCreated).toBe(3);
    expect(result.unitSummaries).toEqual([
      { unitId: 'unit-1', jobCount: 2 },
      { unitId: 'unit-2', jobCount: 1 },
    ]);
    expect(fillTheJob).not.toHaveBeenCalled();
  });

  it('blocks non-UUID production unit references before querying or creating jobs', async () => {
    updateWorkingMemory(threadId, {
      dosageResults: [{ unitProductionId: 'vite', products: [] }] as unknown as [],
    });
    const tool = createCreateJobsTool(threadId);

    const result = JSON.parse(await tool.func({ queueJobId: 'queue-1', persist: true }));

    expect(result.code).toBe('INVALID_PRODUCTION_UNIT_REFERENCE');
    expect(result.blocked).toBe(true);
    expect(result.invalidUnitCount).toBe(1);
    expect(result.error).toMatch(/riferimento unita produttiva non valido/i);
    expect(prisma.job.findMany).not.toHaveBeenCalled();
    expect(fillTheJob).not.toHaveBeenCalled();
  });
});
