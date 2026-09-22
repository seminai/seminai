import { DosageLogEvent } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceBufferEvent(this: DosageLoggerServiceContext, event: DosageLogEvent): void {
    const key = event.jobId;
    if (!this.eventBuffers.has(key)) {
      this.eventBuffers.set(key, []);
      setTimeout(() => this.eventBuffers.delete(key), this.BUFFER_TTL_MS);
    }
    const buffer = this.eventBuffers.get(key)!;
    if (buffer.length < this.BUFFER_MAX_SIZE) {
      buffer.push(event);
    }
  }
