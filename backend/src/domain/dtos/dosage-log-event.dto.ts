/**
 * Types of log events emitted during dosage agent processing
 */
export enum DosageLogEventType {
  INFO = 'info',
  MATCH = 'match',
  MATCH_FALLBACK = 'match-fallback',
  LLM_MATCH = 'llm-match',
  LABEL_EXTRACTION = 'label-extraction',
  SIAN = 'sian',
  FLOWS = 'flows',
  FLOWS_TIMING = 'flows-timing',
  WARNING = 'warning',
  ERROR = 'error',
  PROGRESS = 'progress',
  COMPLETED = 'completed',
}

/**
 * Base structure for all dosage log events
 */
export interface DosageLogEvent {
  readonly jobId: string;
  readonly userId: string;
  readonly timestamp: Date;
  readonly type: DosageLogEventType;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Product match event data
 */
export interface ProductMatchLogEvent extends DosageLogEvent {
  readonly type: DosageLogEventType.MATCH;
  readonly metadata: {
    readonly productName: string;
    readonly productId: string;
    readonly unitName: string;
    readonly cropName: string;
    readonly variety?: string;
    readonly quantity: number;
  };
}

/**
 * LLM match event data
 */
export interface LLMMatchLogEvent extends DosageLogEvent {
  readonly type: DosageLogEventType.LLM_MATCH;
  readonly metadata: {
    readonly productName: string;
    readonly cropName: string;
    readonly compatible: boolean;
    readonly confidence: number;
    readonly reason?: string;
  };
}

/**
 * Progress event data
 */
export interface ProgressLogEvent extends DosageLogEvent {
  readonly type: DosageLogEventType.PROGRESS;
  readonly metadata: {
    readonly progress: number;
    readonly phase: string;
  };
}

/**
 * Timing event data
 */
export interface TimingLogEvent extends DosageLogEvent {
  readonly type: DosageLogEventType.FLOWS_TIMING;
  readonly metadata: {
    readonly phase: string;
    readonly duration: number;
    readonly memoryUsage?: string;
  };
}
