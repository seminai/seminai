import { AppError } from '../../domain/errors/AppError';
import { LLM_PROVIDERS } from './llmProviders';

const APP_MODES = ['all', 'api', 'worker'] as const;
const STORAGE_DRIVERS = ['local', 's3'] as const;
const NODE_ENVS = ['development', 'production', 'test'] as const;

function emptyToUndefined(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function isOneOf<T extends string>(value: string | undefined, allowed: readonly T[]): boolean {
  return value !== undefined && (allowed as readonly string[]).includes(value);
}

function isTestRuntime(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.NODE_ENV === 'test' || Boolean(env.JEST_WORKER_ID);
}

/**
 * Validates process environment after secret bootstrap.
 * Mirrors the local-first Zod contract without importing `zod`, which would
 * hoist Zod 4 into LangChain tool schemas and break type-check.
 */
export function validateRuntimeEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const nodeEnv = emptyToUndefined(env.NODE_ENV);
  const appMode = emptyToUndefined(env.APP_MODE);
  const port = emptyToUndefined(env.PORT);
  const storageDriver = emptyToUndefined(env.STORAGE_DRIVER);
  const llmGateway = emptyToUndefined(env.LLM_GATEWAY);
  const jwtSecret = emptyToUndefined(env.JWT_SECRET);
  const encryptionSecret = emptyToUndefined(env.ENCRYPTION_SECRET);
  const databaseUrl = emptyToUndefined(env.DATABASE_URL);

  if (nodeEnv && !isOneOf(nodeEnv, NODE_ENVS)) {
    throw AppError.badRequest('Invalid environment: NODE_ENV', 'INVALID_ENV');
  }
  if (appMode && !isOneOf(appMode, APP_MODES)) {
    throw AppError.badRequest('Invalid environment: APP_MODE', 'INVALID_ENV');
  }
  if (port && !/^\d+$/.test(port)) {
    throw AppError.badRequest('Invalid environment: PORT must be a number', 'INVALID_ENV');
  }
  if (storageDriver && !isOneOf(storageDriver, STORAGE_DRIVERS)) {
    throw AppError.badRequest('Invalid environment: STORAGE_DRIVER', 'INVALID_ENV');
  }
  if (llmGateway && !isOneOf(llmGateway, LLM_PROVIDERS)) {
    throw AppError.badRequest('Invalid environment: LLM_GATEWAY', 'INVALID_ENV');
  }
  if (isTestRuntime(env)) return;
  if (!databaseUrl) {
    throw AppError.badRequest('DATABASE_URL is required', 'INVALID_ENV');
  }
  if (!jwtSecret || jwtSecret.length < 32) {
    throw AppError.badRequest('JWT_SECRET is required after bootstrap', 'INVALID_ENV');
  }
  if (!encryptionSecret || encryptionSecret.length < 32) {
    throw AppError.badRequest('ENCRYPTION_SECRET is required after bootstrap', 'INVALID_ENV');
  }
}
