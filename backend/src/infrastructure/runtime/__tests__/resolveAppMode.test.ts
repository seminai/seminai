import { AppError } from '../../../domain/errors/AppError';
import { resolveAppMode, resolveRuntimeEntry } from '../resolveAppMode';
import { shouldStartQueueWorkers } from '../shouldStartQueueWorkers';

describe('APP_MODE runtime', () => {
  const original = process.env.APP_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = original;
  });

  it('defaults to all and starts inline workers', () => {
    delete process.env.APP_MODE;
    expect(resolveAppMode()).toBe('all');
    expect(shouldStartQueueWorkers()).toBe(true);
    expect(resolveRuntimeEntry()).toBe('http');
  });

  it('keeps the HTTP process as a producer in api mode', () => {
    process.env.APP_MODE = 'api';
    expect(resolveAppMode()).toBe('api');
    expect(shouldStartQueueWorkers()).toBe(false);
    expect(resolveRuntimeEntry()).toBe('http');
  });

  it('loads the worker entrypoint in worker mode', () => {
    process.env.APP_MODE = 'worker';
    expect(resolveAppMode()).toBe('worker');
    expect(shouldStartQueueWorkers()).toBe(true);
    expect(resolveRuntimeEntry()).toBe('worker');
  });

  it('rejects unknown modes', () => {
    try {
      resolveAppMode('sidecar');
      throw new Error('expected invalid APP_MODE to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_APP_MODE');
    }
  });
});
