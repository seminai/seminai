import { DosageLogEvent } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceEmitEvent(this: DosageLoggerServiceContext, event: DosageLogEvent): void {
    this.bufferEvent(event);
    if (!this.isInitialized()) {
      return;
    }
    const room = `job:${event.jobId}`;
    this.io?.to(room).emit('dosage:log', event);
  }
