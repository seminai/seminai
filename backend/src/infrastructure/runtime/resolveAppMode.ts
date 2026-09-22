import { AppError } from '../../domain/errors/AppError';

export type AppMode = 'all' | 'api' | 'worker';
export type RuntimeEntry = 'http' | 'worker';

/** Validates and returns the selected process role. */
export function resolveAppMode(value = process.env.APP_MODE): AppMode {
  const mode = value || 'all';
  if (mode === 'all' || mode === 'api' || mode === 'worker') return mode;
  throw AppError.badRequest(`Unsupported APP_MODE: ${mode}`, 'INVALID_APP_MODE');
}

/** Returns which process entrypoint this mode should load. */
export function resolveRuntimeEntry(mode = resolveAppMode()): RuntimeEntry {
  return mode === 'worker' ? 'worker' : 'http';
}
