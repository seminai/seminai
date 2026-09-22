import { DosageLogEventType } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceLogInfo(this: DosageLoggerServiceContext, params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    console.log(`[DOSAGE-LOGGER][${params.jobId}] ${params.message}`);
    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.INFO,
      message: params.message,
      metadata: params.metadata,
    });
  }
