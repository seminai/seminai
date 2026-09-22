import { DosageLogEventType, ProgressLogEvent } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceLogProgress(this: DosageLoggerServiceContext, params: {
    readonly jobId: string;
    readonly userId: string;
    readonly progress: number;
    readonly phase: string;
  }): void {
    console.log(`[DOSAGE-PROGRESS][${params.jobId}] ${params.phase}: ${params.progress}%`);

    const event: ProgressLogEvent = {
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.PROGRESS,
      message: `${params.phase}: ${params.progress}%`,
      metadata: {
        progress: params.progress,
        phase: params.phase,
      },
    };
    this.emitEvent(event);
  }
