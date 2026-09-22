import { JobCategory } from '@prisma/client';
import { Job } from '../../../../../../domain/entities/Job';
import type { JobWithAssignmentWithoutHistoryDTO } from '../../../../../../domain/dtos/job-assignment.dto';
import type { IJobRepository } from '../../../../../../domain/repositories/IJobRepository';
import { createListUnverifiedOperationsTool } from '../operations-history/list-unverified-operations.tool';

function buildRepository(operations: JobWithAssignmentWithoutHistoryDTO[]): IJobRepository {
  return {
    findJobGroupsSummaryByUserId: jest.fn().mockResolvedValue([
      {
        jobId: 'group-1',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        company: { id: 'company-1', name: 'Azienda Test' },
        totalOperations: 2,
        verifiedOperations: 1,
        pendingOperations: 1,
      },
    ]),
    findUnverifiedJobsByUserIdWithAssignment: jest.fn().mockResolvedValue(operations),
  } as unknown as IJobRepository;
}

function buildUnverifiedOperation(): JobWithAssignmentWithoutHistoryDTO {
  return {
    job: new Job(
      'job-1',
      'group-1',
      'unit-1',
      null,
      new Date('2026-06-20T00:00:00Z'),
      false,
      false,
      JobCategory.TREATMENT,
      200,
      'L',
      4,
      'kg',
      null,
      'Peronospora',
      null,
      2,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      new Date(),
      new Date(),
    ),
    productionUnit: { id: 'unit-1', name: 'Vigneto', cropName: 'Vite', cropType: 'Uva', sauHa: 2 },
    products: [{ id: 'product-1', name: 'Rame', registrationNumber: null }],
    fields: [{ id: 'field-1', name: 'Campo' }],
    company: { id: 'company-1', name: 'Azienda Test' },
    machine: null,
  };
}

describe('list_unverified_operations tool', () => {
  it('returns pending operations grouped by archive group', async () => {
    const repository = buildRepository([buildUnverifiedOperation()]);
    const tool = createListUnverifiedOperationsTool('user-1', repository);

    const actualResult = JSON.parse(await tool.func({})) as {
      groups: Array<{
        readonly pendingCount: number;
        readonly markdownTable: string;
      }>;
    };

    expect(actualResult.groups).toHaveLength(1);
    expect(actualResult.groups[0]?.pendingCount).toBe(1);
    expect(actualResult.groups[0]?.markdownTable).toContain('Archivio da validare');
    expect(actualResult.groups[0]?.markdownTable).toContain('Rame');
  });
});
