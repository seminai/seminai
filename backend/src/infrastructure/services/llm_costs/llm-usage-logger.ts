import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { TokenUsage, UsageAccumulator } from './usage';
import { LlmUsageMetadata, UsageTracker, UsageRecord, FallbackEventMeta, ProviderStats } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';
import { llmUsageLoggerCreateTracker } from './llm-usage-logger.01-create-tracker';
import { llmUsageLoggerLogFromUsage } from './llm-usage-logger.02-log-from-usage';
import { llmUsageLoggerLogFromAccumulator } from './llm-usage-logger.03-log-from-accumulator';
import { llmUsageLoggerLogFallbackEvent } from './llm-usage-logger.04-log-fallback-event';
import { llmUsageLoggerGetProviderStats } from './llm-usage-logger.05-get-provider-stats';
import { llmUsageLoggerEmitAnalytics } from './llm-usage-logger.06-emit-analytics';
import { llmUsageLoggerTrackProviderCall } from './llm-usage-logger.07-track-provider-call';
import { llmUsageLoggerCheckFallbackRateAlert } from './llm-usage-logger.08-check-fallback-rate-alert';
import { llmUsageLoggerFlush } from './llm-usage-logger.09-flush';
import { llmUsageLoggerShutdown } from './llm-usage-logger.10-shutdown';
import { llmUsageLoggerStartFlushTimer } from './llm-usage-logger.11-start-flush-timer';
import { llmUsageLoggerPersistBatchWithRetry } from './llm-usage-logger.12-persist-batch-with-retry';
import { llmUsageLoggerPersistBatch } from './llm-usage-logger.13-persist-batch';
import { llmUsageLoggerPersistSingleRecord } from './llm-usage-logger.14-persist-single-record';
import { llmUsageLoggerIsRetryableError } from './llm-usage-logger.15-is-retryable-error';
import { llmUsageLoggerExtractErrorInfo } from './llm-usage-logger.16-extract-error-info';
import { llmUsageLoggerLogPersistError } from './llm-usage-logger.17-log-persist-error';
import { llmUsageLoggerSleep } from './llm-usage-logger.18-sleep';


/**
 * Centralized logger for LLM usage and costs.
 * Uses batching and retry logic to reduce database connection pressure.
 * Provides helpers to attach token collectors to LangChain calls and persist costs in Prisma.
 * Tracks provider fallback events and success rates for monitoring.
 */
export class LlmUsageLogger {

  private static instance: LlmUsageLogger | null = null;
  readonly pendingRecords: UsageRecord[] = [];
  flushTimer: ReturnType<typeof setTimeout> | null = null;
  isFlushing = false;
  readonly providerStats: ProviderStats = {
    claudeCalls: 0,
    claudeSuccesses: 0,
    openaiCalls: 0,
    openaiSuccesses: 0,
    openrouterCalls: 0,
    openrouterSuccesses: 0,
    providerCalls: {},
    providerSuccesses: {},
    fallbackEvents: 0,
    fallbackReasons: {},
  };

  constructor() {
    if (process.env.NODE_ENV !== 'test') {
      this.startFlushTimer();
    }
  }

  public static getInstance(): LlmUsageLogger {
    if (!LlmUsageLogger.instance) {
      LlmUsageLogger.instance = new LlmUsageLogger();
    }
    return LlmUsageLogger.instance;
  }

  public createTracker(callbacks?: ReadonlyArray<BaseCallbackHandler>): UsageTracker {
    return llmUsageLoggerCreateTracker.call(this as unknown as LlmUsageLoggerContext, callbacks);
  }

  public async logFromUsage(tokens: TokenUsage, meta: LlmUsageMetadata): Promise<void> {
    return llmUsageLoggerLogFromUsage.call(this as unknown as LlmUsageLoggerContext, tokens, meta);
  }

  public async logFromAccumulator(
    accumulator: UsageAccumulator,
    meta: LlmUsageMetadata,
  ): Promise<void> {
    return llmUsageLoggerLogFromAccumulator.call(this as unknown as LlmUsageLoggerContext, accumulator, meta);
  }

  /**
   * Logs a provider fallback event for monitoring and alerting.
   * Records that the primary provider failed and a fallback was used.
   */
  public logFallbackEvent(meta: FallbackEventMeta): void {
    llmUsageLoggerLogFallbackEvent.call(this as unknown as LlmUsageLoggerContext, meta);
  }

  /**
   * Returns a snapshot of provider statistics for monitoring.
   */
  public getProviderStats(): Readonly<ProviderStats> {
    return llmUsageLoggerGetProviderStats.call(this as unknown as LlmUsageLoggerContext);
  }

  /**
   * Mirrors a generation to PostHog as a `$ai_generation` event (LLM
   * observability). Fire-and-forget — the adapter swallows errors, so this
   * never affects cost logging. Reuses the already-computed tokens + cost.
   */
  emitAnalytics(tokens: TokenUsage, totalCostUsd: number, meta: LlmUsageMetadata): void {
    llmUsageLoggerEmitAnalytics.call(this as unknown as LlmUsageLoggerContext, tokens, totalCostUsd, meta);
  }

  /** Tracks a provider call success/failure */
  trackProviderCall(model: string, success: boolean): void {
    llmUsageLoggerTrackProviderCall.call(this as unknown as LlmUsageLoggerContext, model, success);
  }

  /** Alerts if fallback rate exceeds threshold */
  checkFallbackRateAlert(): void {
    llmUsageLoggerCheckFallbackRateAlert.call(this as unknown as LlmUsageLoggerContext);
  }

  public async flush(): Promise<void> {
    return llmUsageLoggerFlush.call(this as unknown as LlmUsageLoggerContext);
  }

  public async shutdown(options: { readonly flushPending?: boolean } = {}): Promise<void> {
    return llmUsageLoggerShutdown.call(this as unknown as LlmUsageLoggerContext, options);
  }

  startFlushTimer(): void {
    llmUsageLoggerStartFlushTimer.call(this as unknown as LlmUsageLoggerContext);
  }

  async persistBatchWithRetry(records: UsageRecord[]): Promise<void> {
    return llmUsageLoggerPersistBatchWithRetry.call(this as unknown as LlmUsageLoggerContext, records);
  }

  async persistBatch(records: UsageRecord[]): Promise<void> {
    return llmUsageLoggerPersistBatch.call(this as unknown as LlmUsageLoggerContext, records);
  }

  async persistSingleRecord(record: UsageRecord): Promise<void> {
    return llmUsageLoggerPersistSingleRecord.call(this as unknown as LlmUsageLoggerContext, record);
  }

  isRetryableError(error: unknown): boolean {
    return llmUsageLoggerIsRetryableError.call(this as unknown as LlmUsageLoggerContext, error);
  }

  extractErrorInfo(error: unknown): { code?: string; message: string } {
    return llmUsageLoggerExtractErrorInfo.call(this as unknown as LlmUsageLoggerContext, error);
  }

  logPersistError(error: unknown, recordCount: number): void {
    llmUsageLoggerLogPersistError.call(this as unknown as LlmUsageLoggerContext, error, recordCount);
  }

  sleep(ms: number): Promise<void> {
    return llmUsageLoggerSleep.call(this as unknown as LlmUsageLoggerContext, ms);
  }
}

/** @deprecated Use LlmUsageLogger.getInstance() instead. */
export const usageLogger = LlmUsageLogger.getInstance();
