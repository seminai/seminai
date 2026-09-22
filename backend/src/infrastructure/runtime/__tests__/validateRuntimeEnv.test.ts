import { AppError } from '../../../domain/errors/AppError';
import { validateRuntimeEnv } from '../validateRuntimeEnv';

describe('validateRuntimeEnv', () => {
  it('accepts a blank test environment', () => {
    expect(() =>
      validateRuntimeEnv({
        NODE_ENV: 'test',
        APP_MODE: 'all',
      }),
    ).not.toThrow();
  });

  it('rejects an unknown LLM_GATEWAY', () => {
    try {
      validateRuntimeEnv({ NODE_ENV: 'test', LLM_GATEWAY: 'mistral' });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_ENV');
    }
  });

  it('rejects an unknown APP_MODE', () => {
    try {
      validateRuntimeEnv({ NODE_ENV: 'test', APP_MODE: 'sidecar' });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_ENV');
    }
  });

  it('requires DATABASE_URL outside tests', () => {
    try {
      validateRuntimeEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'j'.repeat(40),
        ENCRYPTION_SECRET: 'e'.repeat(40),
      });
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_ENV');
    }
  });
});
