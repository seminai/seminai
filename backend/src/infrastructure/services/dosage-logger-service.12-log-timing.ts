import { DosageLogEventType, TimingLogEvent } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceLogTiming(this: DosageLoggerServiceContext, params: {
    readonly jobId: string;
    readonly userId: string;
    readonly phase: string;
    readonly duration: number;
    readonly memoryUsage?: string;
  }): void {
    const message = `${params.phase} took ${params.duration.toFixed(2)}ms${params.memoryUsage ? ` | ${params.memoryUsage}` : ''}`;
    console.log(`[FLOWS][TIMING] ${message}`);

    const event: TimingLogEvent = {
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.FLOWS_TIMING,
      message,
      metadata: {
        phase: params.phase,
        duration: params.duration,
        memoryUsage: params.memoryUsage,
      },
    };
    this.emitEvent(event);
  }
