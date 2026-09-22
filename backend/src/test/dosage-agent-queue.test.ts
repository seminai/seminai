import { DosageAgentQueue } from '../infrastructure/queue/DosageAgentQueue';

jest.mock('../infrastructure/queue/redis.connection', () => ({
  getRedisConnection: jest.fn(() => ({})),
}));

const bullmqMock = {
  queueInstances: [] as Array<Record<string, jest.Mock>>,
  workerInstances: [] as Array<{ on: jest.Mock; close: jest.Mock }>,
  queueEventsInstances: [] as Array<{ waitUntilReady: jest.Mock; close: jest.Mock; on: jest.Mock }>,
};

jest.mock('bullmq', () => {
  const queueFactory = jest.fn(() => {
    const instance = {
      add: jest.fn(),
      getJob: jest.fn(),
      close: jest.fn(),
    };
    bullmqMock.queueInstances.push(instance);
    return instance;
  });

  const workerFactory = jest.fn(() => {
    const instance = {
      on: jest.fn(),
      close: jest.fn(),
    };
    bullmqMock.workerInstances.push(instance);
    return instance;
  });

  const queueEventsFactory = jest.fn(() => {
    const instance = {
      waitUntilReady: jest.fn(() => Promise.resolve()),
      close: jest.fn(),
      on: jest.fn(),
    };
    bullmqMock.queueEventsInstances.push(instance);
    return instance;
  });

  return {
    Queue: queueFactory,
    Worker: workerFactory,
    QueueEvents: queueEventsFactory,
    Job: jest.fn(),
  };
});

describe('DosageAgentQueue', () => {
  const resetBullmqState = (): void => {
    const mockedModule = jest.requireMock('bullmq') as Record<string, jest.Mock>;
    mockedModule.Queue.mockClear();
    mockedModule.Worker.mockClear();
    mockedModule.QueueEvents.mockClear();
    bullmqMock.queueInstances = [];
    bullmqMock.workerInstances = [];
    bullmqMock.queueEventsInstances = [];
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetBullmqState();
  });

  it('configures worker with tuned lock options and queue events', () => {
    const instance = new DosageAgentQueue();
    instance.startWorker();
    const mockedModule = jest.requireMock('bullmq') as Record<string, jest.Mock>;
    expect(mockedModule.Worker).toHaveBeenCalledTimes(1);
    const workerCallArgs = mockedModule.Worker.mock.calls[0];
    const workerOptions = workerCallArgs[2];
    expect(workerOptions).toMatchObject({
      concurrency: 1,
      lockDuration: 1_800_000,
      lockRenewTime: 240_000,
      stalledInterval: 240_000,
      maxStalledCount: 2,
    });
    expect(mockedModule.QueueEvents).toHaveBeenCalledTimes(1);
    const eventsInstance = bullmqMock.queueEventsInstances[0];
    expect(eventsInstance.waitUntilReady).toHaveBeenCalled();
    expect(eventsInstance.on).toHaveBeenCalledWith('stalled', expect.any(Function));
  });

  it('fails jobs explicitly when lock renewal fails', async () => {
    const instance = new DosageAgentQueue();
    const mockedQueue = bullmqMock.queueInstances[0];
    const moveToFailed = jest.fn(() => Promise.resolve());
    const logMock = jest.fn(() => Promise.resolve());
    mockedQueue.getJob.mockResolvedValue({
      id: '42',
      token: 'fallback-token',
      moveToFailed,
      log: logMock,
    });
    const activeTokens = Reflect.get(instance as object, 'activeJobTokens') as Map<string, string>;
    activeTokens.set('42', 'stored-token');

    await (
      instance as unknown as {
        handleLockRenewalFailure: (jobIds: string[]) => Promise<void>;
      }
    ).handleLockRenewalFailure(['42']);

    expect(mockedQueue.getJob).toHaveBeenCalledWith('42');
    expect(moveToFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Lock renewal failed after 1800000ms for job 42',
        name: 'LockRenewalFailedError',
      }),
      'stored-token',
    );
    expect(activeTokens.has('42')).toBe(false);
    expect(logMock).not.toHaveBeenCalled();
  });
});
