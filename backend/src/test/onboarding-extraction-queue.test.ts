import { OnboardingExtractionQueue } from '../infrastructure/queue/OnboardingExtractionQueue';

jest.mock('../infrastructure/queue/redis.connection', () => ({
  getRedisConnection: jest.fn(() => ({})),
}));

jest.mock(
  '../infrastructure/services/agents/dosage_agent_react/socket/chat-socket-emitter',
  () => ({
    getGlobalSocketIO: jest.fn(() => null),
    setGlobalSocketIO: jest.fn(),
  }),
);

const bullmqMock = {
  queueInstances: [] as Array<Record<string, jest.Mock>>,
  workerInstances: [] as Array<{ on: jest.Mock; close: jest.Mock }>,
  queueEventsInstances: [] as Array<{
    waitUntilReady: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
  }>,
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
    const instance = { on: jest.fn(), close: jest.fn() };
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

describe('OnboardingExtractionQueue', () => {
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

  it('creates queue and queue events on construction', () => {
    const instance = new OnboardingExtractionQueue();
    const mockedModule = jest.requireMock('bullmq') as Record<string, jest.Mock>;
    expect(mockedModule.Queue).toHaveBeenCalledTimes(1);
    expect(mockedModule.Queue).toHaveBeenCalledWith('onboarding-extraction', expect.anything());
    expect(mockedModule.QueueEvents).toHaveBeenCalledTimes(1);
    expect(instance.queueEvents).toBeTruthy();
  });

  it('configures worker with concurrency 2 and lock settings', () => {
    const instance = new OnboardingExtractionQueue();
    instance.startWorker();
    const mockedModule = jest.requireMock('bullmq') as Record<string, jest.Mock>;
    expect(mockedModule.Worker).toHaveBeenCalledTimes(1);
    const workerCallArgs = mockedModule.Worker.mock.calls[0];
    const workerOptions = workerCallArgs[2];
    expect(workerOptions).toMatchObject({
      concurrency: 2,
      lockDuration: 1_200_000,
      lockRenewTime: 180_000,
      stalledInterval: 180_000,
      maxStalledCount: 2,
    });
  });

  it('does not start worker twice', () => {
    const instance = new OnboardingExtractionQueue();
    instance.startWorker();
    instance.startWorker();
    const mockedModule = jest.requireMock('bullmq') as Record<string, jest.Mock>;
    expect(mockedModule.Worker).toHaveBeenCalledTimes(1);
  });

  it('addJob compresses data and returns job id', async () => {
    const instance = new OnboardingExtractionQueue();
    const mockedQueue = bullmqMock.queueInstances[0];
    mockedQueue.add.mockResolvedValue({ id: 'test-job-123' });

    const jobId = await instance.addJob({
      fileBuffer: Buffer.from('test'),
      originalName: 'test.pdf',
      mimeType: 'application/pdf',
      userId: 'user-1',
    });

    expect(jobId).toBe('test-job-123');
    expect(mockedQueue.add).toHaveBeenCalledWith(
      'extract-onboarding',
      expect.any(Object),
      expect.objectContaining({
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
  });

  it('getJobStatus returns progress data from job', async () => {
    const instance = new OnboardingExtractionQueue();
    const mockedQueue = bullmqMock.queueInstances[0];

    const mockJob = {
      id: 'test-job-456',
      progress: {
        version: 1,
        phase: 'parsing_pdf',
        progress: 42,
        message: 'Reading...',
        updatedAt: '',
      },
      data: { compressed: false, userId: 'user-1' },
      getState: jest.fn().mockResolvedValue('active'),
      returnvalue: undefined,
      failedReason: undefined,
      processedOn: 1000,
      finishedOn: undefined,
    };
    mockedQueue.getJob.mockResolvedValue(mockJob);

    const status = await instance.getJobStatus('test-job-456');
    expect(status.id).toBe('test-job-456');
    expect(status.state).toBe('active');
    expect(status.progress).toBe(42);
    expect(status.phase).toBe('parsing_pdf');
    expect(status.message).toBe('Reading...');
  });

  it('getJobStatus throws when job not found', async () => {
    const instance = new OnboardingExtractionQueue();
    const mockedQueue = bullmqMock.queueInstances[0];
    mockedQueue.getJob.mockResolvedValue(null);

    await expect(instance.getJobStatus('nonexistent')).rejects.toThrow('not found');
  });

  it('stopWorker closes worker and queue events', async () => {
    const instance = new OnboardingExtractionQueue();
    instance.startWorker();
    await instance.stopWorker();
    expect(instance.worker).toBeNull();
    expect(instance.queueEvents).toBeNull();
  });
});
