import { Server as SocketServer } from 'socket.io';
import { DosageLogEvent } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';
import { dosageLoggerServiceInitialize } from './dosage-logger-service.01-initialize';
import { dosageLoggerServiceIsInitialized } from './dosage-logger-service.02-is-initialized';
import { dosageLoggerServiceBufferEvent } from './dosage-logger-service.03-buffer-event';
import { dosageLoggerServiceReplayEvents } from './dosage-logger-service.04-replay-events';
import { dosageLoggerServiceClearBuffer } from './dosage-logger-service.05-clear-buffer';
import { dosageLoggerServiceEmitEvent } from './dosage-logger-service.06-emit-event';
import { dosageLoggerServiceLogInfo } from './dosage-logger-service.07-log-info';
import { dosageLoggerServiceLogProductMatch } from './dosage-logger-service.08-log-product-match';
import { dosageLoggerServiceLogMatchFallback } from './dosage-logger-service.09-log-match-fallback';
import { dosageLoggerServiceLogLLMMatch } from './dosage-logger-service.10-log-llmmatch';
import { dosageLoggerServiceLogFlow } from './dosage-logger-service.11-log-flow';
import { dosageLoggerServiceLogTiming } from './dosage-logger-service.12-log-timing';
import { dosageLoggerServiceLogWarning } from './dosage-logger-service.13-log-warning';
import { dosageLoggerServiceLogError } from './dosage-logger-service.14-log-error';
import { dosageLoggerServiceLogProgress } from './dosage-logger-service.15-log-progress';
import { dosageLoggerServiceLogLabelExtraction } from './dosage-logger-service.16-log-label-extraction';
import { dosageLoggerServiceLogCompletion } from './dosage-logger-service.17-log-completion';
import { dosageLoggerServiceLogSian } from './dosage-logger-service.18-log-sian';


/**
 * Service for emitting dosage agent logs via Socket.IO
 * Manages real-time log streaming to connected clients
 */
export class DosageLoggerService {

  private static instance: DosageLoggerService | null = null;
  io: SocketServer | null = null;
  readonly eventBuffers: Map<string, DosageLogEvent[]> = new Map();
  readonly BUFFER_MAX_SIZE = 100;
  readonly BUFFER_TTL_MS = 60_000;

  constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): DosageLoggerService {
    if (!DosageLoggerService.instance) {
      DosageLoggerService.instance = new DosageLoggerService();
    }
    return DosageLoggerService.instance;
  }

  /**
   * Initialize the logger service with Socket.IO server
   */
  initialize(io: SocketServer): void {
    dosageLoggerServiceInitialize.call(this as unknown as DosageLoggerServiceContext, io);
  }

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return dosageLoggerServiceIsInitialized.call(this as unknown as DosageLoggerServiceContext);
  }

  /**
   * Buffer an event for replay when clients join late
   */
  bufferEvent(event: DosageLogEvent): void {
    dosageLoggerServiceBufferEvent.call(this as unknown as DosageLoggerServiceContext, event);
  }

  /**
   * Replay buffered events to a specific socket (for late joiners)
   */
  replayEvents(jobId: string, socketId: string): void {
    dosageLoggerServiceReplayEvents.call(this as unknown as DosageLoggerServiceContext, jobId, socketId);
  }

  /**
   * Clear buffered events for a completed job
   */
  clearBuffer(jobId: string): void {
    dosageLoggerServiceClearBuffer.call(this as unknown as DosageLoggerServiceContext, jobId);
  }

  /**
   * Emit a generic log event
   */
  emitEvent(event: DosageLogEvent): void {
    dosageLoggerServiceEmitEvent.call(this as unknown as DosageLoggerServiceContext, event);
  }

  /**
   * Log a generic info message
   */
  logInfo(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    dosageLoggerServiceLogInfo.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log a product match event
   */
  logProductMatch(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly productName: string;
    readonly productId: string;
    readonly unitName: string;
    readonly cropName: string;
    readonly variety?: string;
    readonly quantity: number;
  }): void {
    dosageLoggerServiceLogProductMatch.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log a match fallback event
   */
  logMatchFallback(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly mechanicalMatches: number;
    readonly unmatchedProducts: number;
    readonly unitName: string;
    readonly cropName: string;
    readonly variety?: string;
  }): void {
    dosageLoggerServiceLogMatchFallback.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log an LLM match event
   */
  logLLMMatch(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly productName: string;
    readonly cropName: string;
    readonly compatible: boolean;
    readonly confidence: number;
    readonly reason?: string;
  }): void {
    dosageLoggerServiceLogLLMMatch.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log a flow-related message
   */
  logFlow(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    dosageLoggerServiceLogFlow.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log a timing event
   */
  logTiming(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly phase: string;
    readonly duration: number;
    readonly memoryUsage?: string;
  }): void {
    dosageLoggerServiceLogTiming.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log a warning
   */
  logWarning(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    dosageLoggerServiceLogWarning.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log an error
   */
  logError(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly error?: Error;
    readonly metadata?: Record<string, unknown>;
  }): void {
    dosageLoggerServiceLogError.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log progress update
   */
  logProgress(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly progress: number;
    readonly phase: string;
  }): void {
    dosageLoggerServiceLogProgress.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log label extraction event
   */
  logLabelExtraction(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    dosageLoggerServiceLogLabelExtraction.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log job completion
   */
  logCompletion(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    dosageLoggerServiceLogCompletion.call(this as unknown as DosageLoggerServiceContext, params);
  }

  /**
   * Log SIAN scraping events
   */
  logSian(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    dosageLoggerServiceLogSian.call(this as unknown as DosageLoggerServiceContext, params);
  }
}
