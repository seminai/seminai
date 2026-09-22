import { Server as SocketServer } from 'socket.io';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceInitialize(this: DosageLoggerServiceContext, io: SocketServer): void {
    this.io = io;
    console.log('[DOSAGE-LOGGER] Service initialized');
  }
