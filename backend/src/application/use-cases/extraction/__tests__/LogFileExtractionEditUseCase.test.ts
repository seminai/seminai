import { LogFileExtractionEditUseCase } from '../LogFileExtractionEditUseCase';
import {
  type AppendEditLogInput,
  type FileExtractionEditLogRecord,
  type IFileExtractionEditLogRepository,
} from '../../../../domain/repositories/IFileExtractionEditLogRepository';

function buildRepoMock(): jest.Mocked<IFileExtractionEditLogRepository> {
  return {
    append: jest.fn(),
    findByExtractionId: jest.fn(),
    findConfirmedInvoiceAndDdtLogs: jest.fn(),
  };
}

function buildRecord(
  overrides: Partial<FileExtractionEditLogRecord> = {},
): FileExtractionEditLogRecord {
  return {
    id: 'log-id',
    extractionId: 'ext-1',
    version: 0,
    source: 'LLM_INITIAL',
    beforeData: null,
    afterData: { entries: [] },
    userId: null,
    createdAt: new Date('2026-05-15T00:00:00.000Z'),
    ...overrides,
  };
}

describe('LogFileExtractionEditUseCase', () => {
  it('writes LLM_INITIAL with beforeData=null and userId=null', async () => {
    const repo = buildRepoMock();
    repo.append.mockResolvedValue(buildRecord());
    const useCase = new LogFileExtractionEditUseCase(repo);
    const after = { entries: [{ name: 'urea' }] };

    await useCase.execute({
      extractionId: 'ext-1',
      source: 'LLM_INITIAL',
      before: null,
      after,
      userId: null,
    });

    expect(repo.append).toHaveBeenCalledTimes(1);
    const call = repo.append.mock.calls[0][0] as AppendEditLogInput;
    expect(call.source).toBe('LLM_INITIAL');
    expect(call.beforeData).toBeNull();
    expect(call.afterData).toEqual(after);
    expect(call.userId).toBeNull();
  });

  it('writes USER_EDIT when before differs from after', async () => {
    const repo = buildRepoMock();
    repo.append.mockResolvedValue(buildRecord({ source: 'USER_EDIT', version: 1 }));
    const useCase = new LogFileExtractionEditUseCase(repo);

    const result = await useCase.execute({
      extractionId: 'ext-1',
      source: 'USER_EDIT',
      before: { entries: [{ qty: 1 }] },
      after: { entries: [{ qty: 2 }] },
      userId: 'user-1',
    });

    expect(result).not.toBeNull();
    expect(repo.append).toHaveBeenCalledTimes(1);
    const call = repo.append.mock.calls[0][0] as AppendEditLogInput;
    expect(call.source).toBe('USER_EDIT');
    expect(call.beforeData).toEqual({ entries: [{ qty: 1 }] });
    expect(call.afterData).toEqual({ entries: [{ qty: 2 }] });
    expect(call.userId).toBe('user-1');
  });

  it('skips USER_EDIT when before deeply equals after', async () => {
    const repo = buildRepoMock();
    const useCase = new LogFileExtractionEditUseCase(repo);
    const same = { entries: [{ qty: 5, name: 'urea' }] };

    const result = await useCase.execute({
      extractionId: 'ext-1',
      source: 'USER_EDIT',
      before: same,
      after: { entries: [{ qty: 5, name: 'urea' }] },
      userId: 'user-1',
    });

    expect(result).toBeNull();
    expect(repo.append).not.toHaveBeenCalled();
  });

  it('skips CONFIRM_OVERRIDE when before equals after', async () => {
    const repo = buildRepoMock();
    const useCase = new LogFileExtractionEditUseCase(repo);

    const result = await useCase.execute({
      extractionId: 'ext-1',
      source: 'CONFIRM_OVERRIDE',
      before: { entries: [] },
      after: { entries: [] },
      userId: 'user-1',
    });

    expect(result).toBeNull();
    expect(repo.append).not.toHaveBeenCalled();
  });

  it('writes CONFIRM_OVERRIDE when entries differ', async () => {
    const repo = buildRepoMock();
    repo.append.mockResolvedValue(buildRecord({ source: 'CONFIRM_OVERRIDE', version: 2 }));
    const useCase = new LogFileExtractionEditUseCase(repo);

    await useCase.execute({
      extractionId: 'ext-1',
      source: 'CONFIRM_OVERRIDE',
      before: { entries: [{ accepted: true }] },
      after: { entries: [{ accepted: false }] },
      userId: 'user-2',
    });

    const call = repo.append.mock.calls[0][0] as AppendEditLogInput;
    expect(call.source).toBe('CONFIRM_OVERRIDE');
    expect(call.userId).toBe('user-2');
  });
});
