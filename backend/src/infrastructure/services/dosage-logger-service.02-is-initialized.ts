import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceIsInitialized(this: DosageLoggerServiceContext): boolean {
    return this.io !== null;
  }
