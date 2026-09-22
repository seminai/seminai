import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { TokenUsage, UsageAccumulator } from './usage';
import { LlmUsageMetadata, UsageTracker, UsageRecord, FallbackEventMeta, ProviderStats } from './llm-usage-logger.support';

export interface LlmUsageLoggerContext {
  readonly pendingRecords: UsageRecord[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  isFlushing: boolean;
  readonly providerStats: ProviderStats;
  createTracker(callbacks?: ReadonlyArray<BaseCallbackHandler>): UsageTracker;
  logFromUsage(tokens: TokenUsage, meta: LlmUsageMetadata): Promise<void>;
  logFromAccumulator(accumulator: UsageAccumulator, meta: LlmUsageMetadata): Promise<void>;
  logFallbackEvent(meta: FallbackEventMeta): void;
  getProviderStats(): Readonly<ProviderStats>;
  emitAnalytics(tokens: TokenUsage, totalCostUsd: number, meta: LlmUsageMetadata): void;
  trackProviderCall(model: string, success: boolean): void;
  checkFallbackRateAlert(): void;
  flush(): Promise<void>;
  shutdown(options?: { readonly flushPending?: boolean }): Promise<void>;
  startFlushTimer(): void;
  persistBatchWithRetry(records: UsageRecord[]): Promise<void>;
  persistBatch(records: UsageRecord[]): Promise<void>;
  persistSingleRecord(record: UsageRecord): Promise<void>;
  isRetryableError(error: unknown): boolean;
  extractErrorInfo(error: unknown): { code?: string; message: string };
  logPersistError(error: unknown, recordCount: number): void;
  sleep(ms: number): Promise<void>;
}
