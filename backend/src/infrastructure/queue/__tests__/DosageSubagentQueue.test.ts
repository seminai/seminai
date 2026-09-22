/**
 * Unit tests for DosageSubagentQueue (PR-K of P2).
 * We mock BullMQ (Queue/Worker/QueueEvents), the shared redis connection,
 * and the dosage_agent business logic so the test runs without Redis or DB.
 *
 * Coverage:
 *   1. addJob delegates to the underlying BullMQ queue with the expected
 *      payload and options.
 *   2. The worker processor invokes runFlowsMultiCompany and writes the
 *      result back to working memory via updateWorkingMemoryAsync.
 *   3. On failure, the worker writes a `failed` entry to working memory and
 *      rethrows so BullMQ marks the job failed.
 */

const mockAdd = jest.fn();
const mockClose = jest.fn();
const mockWaitUntilReady = jest.fn().mockResolvedValue(undefined);
const mockWorkerOn = jest.fn();
const mockWorkerClose = jest.fn();
const mockQueueEventsClose = jest.fn();

let capturedProcessor: ((job: { id: string; data: unknown }) => Promise<unknown>) | undefined;

class MockQueue {
  add = mockAdd;
  close = mockClose;
  constructor(
    public readonly name: string,
    public readonly opts: unknown,
  ) {}
}

class MockQueueEvents {
  on = jest.fn();
  close = mockQueueEventsClose;
  waitUntilReady = mockWaitUntilReady;
  constructor(
    public readonly name: string,
    public readonly opts: unknown,
  ) {}
}

class MockWorker {
  on = mockWorkerOn;
  close = mockWorkerClose;
  constructor(
    public readonly name: string,
    processor: (job: { id: string; data: unknown }) => Promise<unknown>,
    public readonly opts: unknown,
  ) {
    capturedProcessor = processor;
  }
}

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string, opts: unknown) => new MockQueue(name, opts)),
  Worker: jest
    .fn()
    .mockImplementation((name, processor, opts) => new MockWorker(name, processor, opts)),
  QueueEvents: jest
    .fn()
    .mockImplementation((name: string, opts: unknown) => new MockQueueEvents(name, opts)),
}));

jest.mock('../redis.connection', () => ({
  getRedisConnection: jest.fn(() => ({
    /* redis stub */
  })),
}));

const mockRunFlows = jest.fn();
jest.mock('../../services/agents/dosage_agent', () => ({
  runFlowsMultiCompany: (...args: unknown[]) => mockRunFlows(...args),
}));

const mockUpdateWmAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/agents/dosage_agent_react/working-memory', () => ({
  updateWorkingMemoryAsync: (...args: unknown[]) => mockUpdateWmAsync(...args),
}));

import { DosageSubagentQueue, _resetDosageSubagentQueueForTesting } from '../DosageSubagentQueue';

describe('DosageSubagentQueue (PR-K)', () => {
  beforeEach(() => {
    mockAdd.mockReset().mockResolvedValue({ id: 'job-xyz-1' });
    mockRunFlows.mockReset();
    mockUpdateWmAsync.mockReset().mockResolvedValue(undefined);
    mockWorkerOn.mockReset();
    capturedProcessor = undefined;
    _resetDosageSubagentQueueForTesting();
  });

  it('addJob delegates to BullMQ Queue.add with the expected payload + options', async () => {
    const sub = new DosageSubagentQueue();
    const jobId = await sub.addJob({
      threadId: 'thread-1',
      userId: 'user-1',
      task: 'Calcola dosaggi',
      input: { products: [], unitOfProduction: [] },
    });

    expect(jobId).toBe('job-xyz-1');
    expect(mockAdd).toHaveBeenCalledWith(
      'dosage_subagent_job',
      expect.objectContaining({
        threadId: 'thread-1',
        userId: 'user-1',
        task: 'Calcola dosaggi',
      }),
      expect.objectContaining({
        attempts: 1,
        removeOnComplete: expect.any(Object),
        removeOnFail: expect.any(Object),
      }),
    );
  });

  it('worker processor runs runFlowsMultiCompany and writes results to WM', async () => {
    const sub = new DosageSubagentQueue();
    sub.startWorker();
    expect(capturedProcessor).toBeDefined();

    mockRunFlows.mockResolvedValueOnce({
      jobs: [{ outcomeWithDosage: [{ unitId: 'u1' }, { unitId: 'u2' }] }],
    });

    const result = await capturedProcessor!({
      id: 'job-7',
      data: {
        threadId: 'thread-1',
        userId: 'user-1',
        task: 't',
        input: { products: [], unitOfProduction: [] },
      },
    });

    expect(mockRunFlows).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      jobId: 'job-7',
      status: 'completed',
      outcomeCount: 2,
    });

    expect(mockUpdateWmAsync).toHaveBeenCalledWith('thread-1', expect.any(Function));
    const updater = mockUpdateWmAsync.mock.calls[0][1] as (mem: unknown) => unknown;
    expect(updater({})).toEqual({
      spawnSubagentResults: {
        jobId: 'job-7',
        status: 'completed',
        outcome: [{ unitId: 'u1' }, { unitId: 'u2' }],
      },
    });
  });

  it('worker records a failed entry in WM and rethrows when the flow errors', async () => {
    const sub = new DosageSubagentQueue();
    sub.startWorker();
    mockRunFlows.mockRejectedValueOnce(new Error('flow blew up'));

    await expect(
      capturedProcessor!({
        id: 'job-8',
        data: {
          threadId: 'thread-1',
          userId: 'user-1',
          task: 't',
          input: { products: [], unitOfProduction: [] },
        },
      }),
    ).rejects.toThrow('flow blew up');

    expect(mockUpdateWmAsync).toHaveBeenCalledTimes(1);
    const updater = mockUpdateWmAsync.mock.calls[0][1] as (mem: unknown) => unknown;
    const written = updater({}) as {
      spawnSubagentResults: { status: string; failedReason: string };
    };
    expect(written.spawnSubagentResults.status).toBe('failed');
    expect(written.spawnSubagentResults.failedReason).toBe('flow blew up');
  });
});
