import { Server as SocketServer } from 'socket.io';
import {
  DosageLogEvent,
  DosageLogEventType,
  ProductMatchLogEvent,
  LLMMatchLogEvent,
  ProgressLogEvent,
  TimingLogEvent,
} from '../../domain/dtos/dosage-log-event.dto';

/**
 * Service for emitting dosage agent logs via Socket.IO
 * Manages real-time log streaming to connected clients
 */
export class DosageLoggerService {
  private static instance: DosageLoggerService | null = null;
  private io: SocketServer | null = null;
  private readonly eventBuffers: Map<string, DosageLogEvent[]> = new Map();
  private readonly BUFFER_MAX_SIZE = 100;
  private readonly BUFFER_TTL_MS = 60_000;

  private constructor() {}

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
    this.io = io;
    console.log('[DOSAGE-LOGGER] Service initialized');
  }

  /**
   * Check if the service is initialized
   */
  private isInitialized(): boolean {
    return this.io !== null;
  }

  /**
   * Buffer an event for replay when clients join late
   */
  private bufferEvent(event: DosageLogEvent): void {
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

  /**
   * Replay buffered events to a specific socket (for late joiners)
   */
  replayEvents(jobId: string, socketId: string): void {
    const buffer = this.eventBuffers.get(jobId);
    if (!buffer || buffer.length === 0 || !this.io) return;
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) return;
    for (const event of buffer) {
      socket.emit('dosage:log', event);
    }
  }

  /**
   * Clear buffered events for a completed job
   */
  clearBuffer(jobId: string): void {
    this.eventBuffers.delete(jobId);
  }

  /**
   * Emit a generic log event
   */
  private emitEvent(event: DosageLogEvent): void {
    this.bufferEvent(event);
    if (!this.isInitialized()) {
      return;
    }
    const room = `job:${event.jobId}`;
    this.io?.to(room).emit('dosage:log', event);
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
    const unitLabel = params.variety ? `${params.cropName} (${params.variety})` : params.cropName;
    const message = `Prodotto "${params.productName}" compatibile con ${unitLabel} - quantità: ${params.quantity}`;
    console.log(`[MATCH] ${message}`);

    const event: ProductMatchLogEvent = {
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.MATCH,
      message,
      metadata: {
        productName: params.productName,
        productId: params.productId,
        unitName: params.unitName,
        cropName: params.cropName,
        variety: params.variety,
        quantity: params.quantity,
      },
    };
    this.emitEvent(event);
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
    const unitLabel = params.variety ? `${params.cropName} (${params.variety})` : params.cropName;
    const message = `${params.mechanicalMatches} prodotti compatibili, ${params.unmatchedProducts} da verificare per ${unitLabel}. Verifica semantica in corso...`;
    console.log(`[MATCH-FALLBACK] ${message}`);

    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.MATCH_FALLBACK,
      message,
      metadata: {
        mechanicalMatches: params.mechanicalMatches,
        unmatchedProducts: params.unmatchedProducts,
        unitName: params.unitName,
        cropName: params.cropName,
        variety: params.variety,
      },
    });
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
    const message = params.compatible
      ? `Prodotto "${params.productName}" compatibile con "${params.cropName}" (affidabilità: ${params.confidence}%)`
      : `Prodotto "${params.productName}" non compatibile con "${params.cropName}" (affidabilità: ${params.confidence}%)`;
    console.log(`[LLM-MATCH] ${message}`);
    if (params.reason) {
      console.log(`[LLM-MATCH] Reason: ${params.reason}`);
    }

    const event: LLMMatchLogEvent = {
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.LLM_MATCH,
      message,
      metadata: {
        productName: params.productName,
        cropName: params.cropName,
        compatible: params.compatible,
        confidence: params.confidence,
        reason: params.reason,
      },
    };
    this.emitEvent(event);
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
    console.log(`[FLOWS] ${params.message}`);
    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.FLOWS,
      message: params.message,
      metadata: params.metadata,
    });
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

  /**
   * Log a warning
   */
  logWarning(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    console.warn(`[DOSAGE-WARNING][${params.jobId}] ${params.message}`);
    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.WARNING,
      message: params.message,
      metadata: params.metadata,
    });
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

  /**
   * Log progress update
   */
  logProgress(params: {
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

  /**
   * Log label extraction event
   */
  logLabelExtraction(params: {
    readonly jobId: string;
    readonly userId: string;
    readonly message: string;
    readonly metadata?: Record<string, unknown>;
  }): void {
    console.log(`[LABEL_EXTRACTION] ${params.message}`);
    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.LABEL_EXTRACTION,
      message: params.message,
      metadata: params.metadata,
    });
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
    console.log(`[DOSAGE-COMPLETED][${params.jobId}] ${params.message}`);
    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.COMPLETED,
      message: params.message,
      metadata: params.metadata,
    });
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
    console.log(`[SIAN] ${params.message}`);
    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.SIAN,
      message: params.message,
      metadata: params.metadata,
    });
  }
}
