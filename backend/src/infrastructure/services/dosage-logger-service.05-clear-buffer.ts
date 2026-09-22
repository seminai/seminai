import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceClearBuffer(this: DosageLoggerServiceContext, jobId: string): void {
    this.eventBuffers.delete(jobId);
  }
