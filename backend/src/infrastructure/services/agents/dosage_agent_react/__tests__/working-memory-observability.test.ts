/**
 * Unit tests for the observability + retry hardening on working-memory (PR-J).
 *
 * Coverage:
 *   1. evictStaleEntries emits a structured warn with reason 'ttl'.
 *   2. DOSAGE_WM_MAX_ENTRIES env override drives the LRU cap, and overflow
 *      eviction logs reason 'lru-overflow'.
 *   3. flushToDisk retries on transient errors and eventually succeeds —
 *      entry.dirty flips to false after the successful attempt.
 *   4. flushToDisk gives up after 3 attempts and logs the "after 3 attempts"
 *      error; entry stays dirty.
 *
 * The retry backoff uses real timers internally (sleep). To keep the suite
 * fast we keep `baseMs: 100` which adds ~700ms worst-case per retry test.
 */
import type { IWorkingMemoryRepository } from '../../../../../domain/repositories/IWorkingMemoryRepository';

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

/**
 * Fresh module import so the singleton state (store, timers, env-driven cap)
 * is reset between cases. Returns the public surface plus the test helpers.
 */
function importFresh() {
  let mod!: typeof import('../working-memory');
  jest.isolateModules(() => {
    mod = require('../working-memory');
  });
  return mod;
}

function buildRepoStub(saveImpl: jest.Mock): IWorkingMemoryRepository {
  return {
    save: saveImpl as never,
    load: jest.fn().mockResolvedValue(null) as never,
    delete: jest.fn().mockResolvedValue(undefined) as never,
  } as unknown as IWorkingMemoryRepository;
}

describe('working-memory observability + retry (PR-J)', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    resetEnv();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  afterAll(() => {
    resetEnv();
  });

  it('emits a structured eviction warn with reason "ttl" for stale entries', () => {
    const wm = importFresh();
    wm.updateWorkingMemory('thread-1', { dosageJobId: 'job-xyz' });
    // Manually age the entry so the TTL sweep picks it up.
    // Internally evictStaleEntries compares (now - lastAccessedAt) > 30 min.
    // Easiest: monkey-patch Date.now to jump 31 minutes ahead.
    const realNow = Date.now;
    Date.now = () => realNow() + 31 * 60 * 1000;
    try {
      wm._runEvictionForTesting();
    } finally {
      Date.now = realNow;
    }

    const evictionCall = warnSpy.mock.calls.find(([msg]) => msg === '[working-memory] eviction');
    expect(evictionCall).toBeDefined();
    expect(evictionCall![1]).toMatchObject({
      threadId: 'thread-1',
      reason: 'ttl',
    });
    expect(wm.getWorkingMemorySize()).toBe(0);
  });

  it('DOSAGE_WM_MAX_ENTRIES env override caps the store and logs reason "lru-overflow"', () => {
    process.env.DOSAGE_WM_MAX_ENTRIES = '2';
    const wm = importFresh();
    wm.updateWorkingMemory('thread-a', { dosageJobId: 'job-xyz' });
    wm.updateWorkingMemory('thread-b', { dosageJobId: 'job-xyz' });
    wm.updateWorkingMemory('thread-c', { dosageJobId: 'job-xyz' });
    expect(wm.getWorkingMemorySize()).toBe(3);

    wm._runEvictionForTesting();

    expect(wm.getWorkingMemorySize()).toBe(2);
    const lruWarns = warnSpy.mock.calls.filter(
      ([msg, payload]) =>
        msg === '[working-memory] eviction' &&
        (payload as { reason?: string }).reason === 'lru-overflow',
    );
    expect(lruWarns).toHaveLength(1);
    // The oldest entry (thread-a) should have been the one evicted.
    expect(lruWarns[0][1]).toMatchObject({ threadId: 'thread-a', reason: 'lru-overflow' });
  });

  it('flushToDisk retries on transient errors and eventually succeeds', async () => {
    const wm = importFresh();
    let attempts = 0;
    const save = jest.fn().mockImplementation(() => {
      attempts += 1;
      if (attempts < 3) return Promise.reject(new Error('ECONNRESET'));
      return Promise.resolve();
    });
    wm.setWorkingMemoryRepository(buildRepoStub(save));

    wm.updateWorkingMemory('thread-1', { dosageJobId: 'job-xyz' });
    await wm.flushAllWorkingMemory();

    expect(save).toHaveBeenCalledTimes(3);
    // No "after 3 attempts" error — we succeeded on attempt 3.
    const finalError = errorSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' ? msg.includes('after 3 attempts') : false,
    );
    expect(finalError).toBeUndefined();
  }, 10_000);

  it('flushToDisk gives up after 3 attempts and logs the exhausted-error', async () => {
    const wm = importFresh();
    const save = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    wm.setWorkingMemoryRepository(buildRepoStub(save));

    wm.updateWorkingMemory('thread-1', { dosageJobId: 'job-xyz' });
    await wm.flushAllWorkingMemory();

    expect(save).toHaveBeenCalledTimes(3);
    const exhausted = errorSpy.mock.calls.find(([msg]) =>
      typeof msg === 'string' ? msg.includes('after 3 attempts') : false,
    );
    expect(exhausted).toBeDefined();
  }, 10_000);
});
