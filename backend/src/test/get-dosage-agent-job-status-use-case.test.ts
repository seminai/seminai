import {
  GetDosageAgentJobStatusUseCase,
  GetDosageAgentJobStatusOutput,
} from '../application/use-cases/job/GetDosageAgentJobStatusUseCase';
import { DosageAgentJob, DosageAgentJobState } from '../domain/entities/DosageAgentJob';
import { DosageAgentQueue } from '../infrastructure/queue/DosageAgentQueue';
import { IDosageAgentJobRepository } from '../domain/repositories/IDosageAgentJobRepository';

type QueueMock = Pick<DosageAgentQueue, 'getJobStatus'>;
type RepoMock = Pick<IDosageAgentJobRepository, 'findById' | 'updateStatus'>;

function makeUseCase(queue: QueueMock, repo: RepoMock): GetDosageAgentJobStatusUseCase {
  return new GetDosageAgentJobStatusUseCase(
    queue as unknown as DosageAgentQueue,
    repo as unknown as IDosageAgentJobRepository,
  );
}

describe('GetDosageAgentJobStatusUseCase', () => {
  it('falls back to DB when Bull job is missing', async () => {
    const finishedOn = new Date('2026-05-04T10:00:00Z');
    const persisted = new DosageAgentJob(
      '137',
      'user-1',
      DosageAgentJobState.COMPLETED,
      100,
      undefined,
      new Date('2026-05-04T09:59:55Z'),
      finishedOn,
    );
    const queue: QueueMock = {
      getJobStatus: jest.fn().mockRejectedValue(new Error('Job 137 not found')),
    };
    const repo: RepoMock = {
      findById: jest.fn().mockResolvedValue(persisted),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    const result = await makeUseCase(queue, repo).execute({ jobId: '137' });

    expect(result).toEqual<GetDosageAgentJobStatusOutput>({
      id: '137',
      state: DosageAgentJobState.COMPLETED,
      progress: 100,
      failedReason: undefined,
      processedOn: persisted.processedOn?.getTime(),
      finishedOn: finishedOn.getTime(),
    });
    expect(repo.findById).toHaveBeenCalledWith('137');
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('returns Bull status and persists it when the job exists', async () => {
    const queueStatus: GetDosageAgentJobStatusOutput = {
      id: '99',
      state: 'active',
      progress: 42,
      data: { productsCount: 1, unitsCount: 4, userId: 'user-1' },
    };
    const queue: QueueMock = {
      getJobStatus: jest.fn().mockResolvedValue(queueStatus),
    };
    const repo: RepoMock = {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    const result = await makeUseCase(queue, repo).execute({ jobId: '99' });

    expect(result).toBe(queueStatus);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: '99',
        state: DosageAgentJobState.ACTIVE,
        progress: 42,
      }),
    );
  });

  it('re-throws when the queue error is not "Job not found"', async () => {
    const queue: QueueMock = {
      getJobStatus: jest.fn().mockRejectedValue(new Error('redis connection lost')),
    };
    const repo: RepoMock = {
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };

    await expect(makeUseCase(queue, repo).execute({ jobId: '7' })).rejects.toThrow(
      'redis connection lost',
    );
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('re-throws the original error when DB has no record either', async () => {
    const queue: QueueMock = {
      getJobStatus: jest.fn().mockRejectedValue(new Error('Job 404 not found')),
    };
    const repo: RepoMock = {
      findById: jest.fn().mockResolvedValue(null),
      updateStatus: jest.fn(),
    };

    await expect(makeUseCase(queue, repo).execute({ jobId: '404' })).rejects.toThrow(
      'Job 404 not found',
    );
    expect(repo.findById).toHaveBeenCalledWith('404');
  });
});
