import { Server as SocketServer } from 'socket.io';
import { DosageLogEvent } from '../../domain/dtos/dosage-log-event.dto';

export interface DosageLoggerServiceContext {
  io: SocketServer | null;
  readonly eventBuffers: Map<string, DosageLogEvent[]>;
  readonly BUFFER_MAX_SIZE: number;
  readonly BUFFER_TTL_MS: number;
  initialize(io: SocketServer): void;
  isInitialized(): boolean;
  bufferEvent(event: DosageLogEvent): void;
  replayEvents(jobId: string, socketId: string): void;
  clearBuffer(jobId: string): void;
  emitEvent(event: DosageLogEvent): void;
  logInfo(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void;
  logProductMatch(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly productName: string;
    readonly productId: string;
    readonly unitName: string;
    readonly cropName: string;
    readonly variety?: string;
    readonly quantity: number;
  }): void;
  logMatchFallback(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly mechanicalMatches: number;
    readonly unmatchedProducts: number;
    readonly unitName: string;
    readonly cropName: string;
    readonly variety?: string;
  }): void;
  logLLMMatch(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly productName: string;
    readonly cropName: string;
    readonly compatible: boolean;
    readonly confidence: number;
    readonly reason?: string;
  }): void;
  logFlow(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void;
  logTiming(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly phase: string;
    readonly duration: number;
    readonly memoryUsage?: string;
  }): void;
  logWarning(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void;
  logError(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly error?: Error;
    readonly metadata?: Record<string, unknown>;
  }): void;
  logProgress(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly progress: number;
    readonly phase: string;
  }): void;
  logLabelExtraction(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void;
  logCompletion(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void;
  logSian(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void;
}
