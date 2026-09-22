import { DosageLogEventType } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceLogError(this: DosageLoggerServiceContext, params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly error?: Error;
    readonly metadata?: Record<string, unknown>;
  }): void {
    console.error(`[DOSAGE-ERROR][${params.jobId}] ${params.message}`, params.error);
    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.ERROR,
      message: params.message,
      metadata: {
        ...params.metadata,
        errorMessage: params.error?.message,
        errorStack: params.error?.stack,
      },
    });
  }
