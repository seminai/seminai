import type { Request, Response } from 'express';
import { QdcController } from '../infrastructure/http/controllers/QdcController';
import { AppError } from '../domain/errors/AppError';
import { prisma } from '../infrastructure/repositories/Prisma';
import { expireStaleRuns, getQdcSyncQueue } from '../infrastructure/queue/QdcSyncQueue';
import { getQdcClientIdForUser } from '../infrastructure/services/agents/dosage_agent_react/tools/qdc/require-qdc';

jest.mock('../infrastructure/repositories/Prisma', () => ({
  prisma: {
    qdcSyncRun: { findFirst: jest.fn(), create: jest.fn() },
    qdcAzienda: { count: jest.fn() },
  },
}));

jest.mock('../infrastructure/queue/QdcSyncQueue', () => ({
  getQdcSyncQueue: jest.fn(),
  expireStaleRuns: jest.fn().mockResolvedValue(0),
}));

jest.mock('../infrastructure/services/agents/dosage_agent_react/tools/qdc/require-qdc', () => ({
  ...jest.requireActual(
    '../infrastructure/services/agents/dosage_agent_react/tools/qdc/require-qdc',
  ),
  getQdcClientIdForUser: jest.fn(),
}));

const mockPrisma = prisma as unknown as {
  qdcSyncRun: { findFirst: jest.Mock; create: jest.Mock };
  qdcAzienda: { count: jest.Mock };
};
const mockGetQueue = getQdcSyncQueue as jest.Mock;
const mockExpireStaleRuns = expireStaleRuns as jest.Mock;
const mockGetClientId = getQdcClientIdForUser as jest.Mock;

function buildResponse(): { response: Response; statusMock: jest.Mock; jsonMock: jest.Mock } {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const response = { status: statusMock, json: jsonMock } as unknown as Response;
  return { response, statusMock, jsonMock };
}

const AUTH_REQUEST = { user: { id: 'user-1' } } as unknown as Request;

describe('QdcController.startSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExpireStaleRuns.mockResolvedValue(0);
    mockGetClientId.mockResolvedValue('client-1');
  });

  it('creates a running run, enqueues the manual job and returns 202', async () => {
    mockPrisma.qdcSyncRun.findFirst.mockResolvedValue(null);
    mockPrisma.qdcSyncRun.create.mockResolvedValue({ id: 'run-42' });
    const addManualJob = jest.fn().mockResolvedValue('job-1');
    mockGetQueue.mockReturnValue({ addManualJob });
    const { response, statusMock, jsonMock } = buildResponse();
    await new QdcController().startSync(AUTH_REQUEST, response);
    expect(statusMock).toHaveBeenCalledWith(202);
    expect(jsonMock).toHaveBeenCalledWith({ status: 'success', data: { syncRunId: 'run-42' } });
    expect(addManualJob).toHaveBeenCalledWith({ syncRunId: 'run-42', userId: 'user-1' });
  });

  it('returns 409 when a run is already in progress', async () => {
    mockPrisma.qdcSyncRun.findFirst.mockResolvedValue({ id: 'run-busy' });
    const { response, statusMock, jsonMock } = buildResponse();
    await new QdcController().startSync(AUTH_REQUEST, response);
    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SYNC_ALREADY_RUNNING', data: { syncRunId: 'run-busy' } }),
    );
    expect(mockPrisma.qdcSyncRun.create).not.toHaveBeenCalled();
  });

  it('throws QDC_NOT_CONFIGURED when no client id is resolvable', async () => {
    mockGetClientId.mockResolvedValue(null);
    const { response } = buildResponse();
    const actualError = await new QdcController()
      .startSync(AUTH_REQUEST, response)
      .catch((error: unknown) => error);
    expect(actualError).toBeInstanceOf(AppError);
    expect((actualError as AppError).code).toBe('QDC_NOT_CONFIGURED');
  });

  it('rejects unauthenticated requests', async () => {
    const { response } = buildResponse();
    const actualError = await new QdcController()
      .startSync({} as Request, response)
      .catch((error: unknown) => error);
    expect(actualError).toBeInstanceOf(AppError);
  });
});

describe('QdcController.getSyncStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the last run and the mirrored aziende count', async () => {
    const startedAt = new Date('2026-07-02T02:30:00.000Z');
    mockPrisma.qdcSyncRun.findFirst.mockResolvedValue({
      id: 'run-1',
      trigger: 'cron',
      status: 'success',
      startedAt,
      finishedAt: null,
      counters: { aziendeTotal: 16 },
      error: null,
    });
    mockPrisma.qdcAzienda.count.mockResolvedValue(16);
    const { response, jsonMock } = buildResponse();
    await new QdcController().getSyncStatus(AUTH_REQUEST, response);
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'success',
      data: {
        run: expect.objectContaining({
          id: 'run-1',
          status: 'success',
          startedAt: startedAt.toISOString(),
          finishedAt: null,
        }),
        aziendaCount: 16,
      },
    });
  });

  it('returns run null when no sync has ever run', async () => {
    mockPrisma.qdcSyncRun.findFirst.mockResolvedValue(null);
    mockPrisma.qdcAzienda.count.mockResolvedValue(0);
    const { response, jsonMock } = buildResponse();
    await new QdcController().getSyncStatus(AUTH_REQUEST, response);
    expect(jsonMock).toHaveBeenCalledWith({
      status: 'success',
      data: { run: null, aziendaCount: 0 },
    });
  });
});
