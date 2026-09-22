import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceReplayEvents(this: DosageLoggerServiceContext, jobId: string, socketId: string): void {
    const buffer = this.eventBuffers.get(jobId);
    if (!buffer || buffer.length === 0 || !this.io) return;
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return;
    for (const event of buffer) {
      socket.emit('dosage:log', event);
    }
  }
