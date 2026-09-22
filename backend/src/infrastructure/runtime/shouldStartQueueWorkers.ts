import { resolveAppMode } from './resolveAppMode';

/** Returns whether this process owns background workers. */
export function shouldStartQueueWorkers(): boolean {
  return resolveAppMode() !== 'api';
}
