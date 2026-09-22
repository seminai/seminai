import { Prisma, LlmJobType } from '@prisma/client';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { prisma } from '../../repositories/Prisma';
import { getAnalyticsService } from '../analytics/analytics-service.singleton';
import { resolveProviderName } from './resolve-provider';
import {
  CostCalculator,
  LangChainUsageCollector,
  ModelPricingRegistry,
  TokenUsage,
  UsageAccumulator,
} from './usage';

type LlmUsageMetadata = {
  readonly userId?: string;
  readonly companyId?: string;
  readonly jobId?: string;
  readonly jobGroupId?: string;
  readonly jobType: LlmJobType;
  readonly model: string;
  readonly metadata?: Prisma.InputJsonValue | null;
  readonly margin?: number;
};

type UsageTracker = {
  readonly accumulator: UsageAccumulator;
  readonly callbacks: BaseCallbackHandler[];
};

type UsageRecord = {
  readonly userId: string;
  readonly companyId: string | null;
  readonly jobId: string | null;
  readonly jobGroupId: string | null;
  readonly jobType: LlmJobType;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly cachedTokens: number;
  readonly cost: number;
  readonly seminaiMargin: number;
  readonly costClient: number;
  readonly metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull;
};

/** Metadata for a provider fallback event */
type FallbackEventMeta = {
  readonly userId?: string;
  readonly companyId?: string;
  readonly jobId?: string;
  readonly operation: string;
  readonly primaryProvider: string;
  readonly primaryModel: string;
  readonly fallbackProvider: string;
  readonly fallbackModel: string;
  readonly errorType: string;
  readonly errorMessage: string;
};

/** In-memory provider usage statistics */
interface ProviderStats {
  claudeCalls: number;
  claudeSuccesses: number;
  openaiCalls: number;
  openaiSuccesses: number;
  openrouterCalls: number;
  openrouterSuccesses: number;
  providerCalls: Record<string, number>;
  providerSuccesses: Record<string, number>;
  fallbackEvents: number;
  fallbackReasons: Record<string, number>;
}

const DEFAULT_MARGIN: number = 0.3;
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const FALLBACK_RATE_ALERT_THRESHOLD = 0.2;

/**
 * Centralized logger for LLM usage and costs.
 * Uses batching and retry logic to reduce database connection pressure.
 * Provides helpers to attach token collectors to LangChain calls and persist costs in Prisma.
 * Tracks provider fallback events and success rates for monitoring.
 */
export class LlmUsageLogger {
  private static instance: LlmUsageLogger | null = null;
  private readonly pendingRecords: UsageRecord[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private readonly providerStats: ProviderStats = {
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

  private constructor() {
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
    const accumulator = new UsageAccumulator();
    const collector = new LangChainUsageCollector(accumulator);
    const mergedCallbacks: BaseCallbackHandler[] =
      Array.isArray(callbacks) && callbacks.length > 0 ? [...callbacks, collector] : [collector];
    return { accumulator, callbacks: mergedCallbacks };
  }

  public async logFromUsage(tokens: TokenUsage, meta: LlmUsageMetadata): Promise<void> {
    if (!meta.userId) {
      return;
    }
    const pricing = ModelPricingRegistry.getPricing(meta.model);
    const margin = typeof meta.margin === 'number' ? meta.margin : DEFAULT_MARGIN;
    const cost = CostCalculator.computeCost({
      tokens,
      pricing,
      margin,
    });

    const record: UsageRecord = {
      userId: meta.userId,
      companyId: meta.companyId ?? null,
      jobId: meta.jobId ?? null,
      jobGroupId: meta.jobGroupId ?? null,
      jobType: meta.jobType,
      model: meta.model,
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      totalTokens: tokens.totalTokens,
      cachedTokens: tokens.cachedPromptTokens,
      cost: cost.totalCostUsd,
      seminaiMargin: margin,
      costClient: cost.costWithMarginUsd,
      metadata: meta.metadata ?? Prisma.JsonNull,
    };

    this.emitAnalytics(tokens, cost.totalCostUsd, meta);
    this.pendingRecords.push(record);

    if (this.pendingRecords.length >= BATCH_SIZE) {
      await this.flush();
    }
  }

  public async logFromAccumulator(
    accumulator: UsageAccumulator,
    meta: LlmUsageMetadata,
  ): Promise<void> {
    this.trackProviderCall(meta.model, true);
    await this.logFromUsage(accumulator.getTotals(), meta);
  }

  /**
   * Logs a provider fallback event for monitoring and alerting.
   * Records that the primary provider failed and a fallback was used.
   */
  public logFallbackEvent(meta: FallbackEventMeta): void {
    this.providerStats.fallbackEvents++;
    const reasonKey = meta.errorType || 'UNKNOWN';
    this.providerStats.fallbackReasons[reasonKey] =
      (this.providerStats.fallbackReasons[reasonKey] || 0) + 1;
    this.trackProviderCall(meta.primaryModel, false);
    console.warn(
      `[LLM-USAGE] Fallback event: ${meta.operation} ${meta.primaryProvider}(${meta.primaryModel}) -> ${meta.fallbackProvider}(${meta.fallbackModel}). Reason: ${meta.errorType}`,
    );
    this.checkFallbackRateAlert();
  }

  /**
   * Returns a snapshot of provider statistics for monitoring.
   */
  public getProviderStats(): Readonly<ProviderStats> {
    return { ...this.providerStats };
  }

  /**
   * Mirrors a generation to PostHog as a `$ai_generation` event (LLM
   * observability). Fire-and-forget — the adapter swallows errors, so this
   * never affects cost logging. Reuses the already-computed tokens + cost.
   */
  private emitAnalytics(tokens: TokenUsage, totalCostUsd: number, meta: LlmUsageMetadata): void {
    getAnalyticsService().captureLlmGeneration({
      distinctId: meta.userId ?? '',
      model: meta.model,
      provider: resolveProviderName(meta.model),
      inputTokens: tokens.promptTokens,
      outputTokens: tokens.completionTokens,
      totalCostUsd,
      jobType: String(meta.jobType),
      groups: meta.companyId ? [{ type: 'company', key: meta.companyId }] : undefined,
    });
  }

  /** Tracks a provider call success/failure */
  private trackProviderCall(model: string, success: boolean): void {
    const provider = resolveProviderName(model);
    this.providerStats.providerCalls[provider] =
      (this.providerStats.providerCalls[provider] || 0) + 1;
    if (success) {
      this.providerStats.providerSuccesses[provider] =
        (this.providerStats.providerSuccesses[provider] || 0) + 1;
    }
    if (provider === 'anthropic') {
      this.providerStats.claudeCalls++;
      if (success) this.providerStats.claudeSuccesses++;
      return;
    }
    if (provider === 'openrouter') {
      this.providerStats.openrouterCalls++;
      if (success) this.providerStats.openrouterSuccesses++;
      return;
    }
    if (provider === 'openai') {
      this.providerStats.openaiCalls++;
      if (success) this.providerStats.openaiSuccesses++;
    }
  }

  /** Alerts if fallback rate exceeds threshold */
  private checkFallbackRateAlert(): void {
    const totalClaude = this.providerStats.claudeCalls;
    if (totalClaude < 10) return;
    const failRate = 1 - this.providerStats.claudeSuccesses / totalClaude;
    if (failRate > FALLBACK_RATE_ALERT_THRESHOLD) {
      console.error(
        `[LLM-USAGE-ALERT] Claude fallback rate ${(failRate * 100).toFixed(1)}% exceeds ${FALLBACK_RATE_ALERT_THRESHOLD * 100}% threshold. ` +
          `Stats: ${this.providerStats.claudeSuccesses}/${totalClaude} successful, ${this.providerStats.fallbackEvents} fallbacks.`,
      );
    }
  }

  public async flush(): Promise<void> {
    if (this.isFlushing || this.pendingRecords.length === 0) {
      return;
    }

    this.isFlushing = true;
    const recordsToFlush = this.pendingRecords.splice(0, this.pendingRecords.length);

    try {
      await this.persistBatchWithRetry(recordsToFlush);
    } catch (error) {
      this.logPersistError(error, recordsToFlush.length);
    } finally {
      this.isFlushing = false;
    }
  }

  public async shutdown(options: { readonly flushPending?: boolean } = {}): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (options.flushPending) {
      await this.flush();
      return;
    }
    this.pendingRecords.splice(0, this.pendingRecords.length);
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        console.warn('[LLM-USAGE] Flush timer error:', err);
      });
    }, FLUSH_INTERVAL_MS);

    if (typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  private async persistBatchWithRetry(records: UsageRecord[]): Promise<void> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await this.persistBatch(records);
        return;
      } catch (error) {
        lastError = error;
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === MAX_RETRIES - 1) {
          throw error;
        }

        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.warn(
          `[LLM-USAGE] Retry ${attempt + 1}/${MAX_RETRIES} after ${backoffMs}ms`,
          this.extractErrorInfo(error),
        );
        await this.sleep(backoffMs);
      }
    }

    throw lastError;
  }

  private async persistBatch(records: UsageRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    if (records.length === 1) {
      await this.persistSingleRecord(records[0]);
      return;
    }

    await prisma.$transaction(
      records.map((record) =>
        prisma.llmUsage.create({
          data: {
            user: { connect: { id: record.userId } },
            company: record.companyId ? { connect: { id: record.companyId } } : undefined,
            jobId: record.jobId,
            jobGroupId: record.jobGroupId,
            jobType: record.jobType,
            model: record.model,
            promptTokens: record.promptTokens,
            completionTokens: record.completionTokens,
            totalTokens: record.totalTokens,
            cachedTokens: record.cachedTokens,
            cost: record.cost,
            seminaiMargin: record.seminaiMargin,
            costClient: record.costClient,
            metadata: record.metadata,
          },
        }),
      ),
    );
  }

  private async persistSingleRecord(record: UsageRecord): Promise<void> {
    await prisma.llmUsage.create({
      data: {
        user: { connect: { id: record.userId } },
        company: record.companyId ? { connect: { id: record.companyId } } : undefined,
        jobId: record.jobId,
        jobGroupId: record.jobGroupId,
        jobType: record.jobType,
        model: record.model,
        promptTokens: record.promptTokens,
        completionTokens: record.completionTokens,
        totalTokens: record.totalTokens,
        cost: record.cost,
        seminaiMargin: record.seminaiMargin,
        costClient: record.costClient,
        metadata: record.metadata,
      },
    });
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const retryableCodes = ['P2024', 'P1001', 'P1002', 'P1008', 'P1017'];
      return retryableCodes.includes(error.code);
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('pool') ||
        message.includes('econnrefused') ||
        message.includes('econnreset')
      );
    }
    return false;
  }

  private extractErrorInfo(error: unknown): { code?: string; message: string } {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { code, message };
  }

  private logPersistError(error: unknown, recordCount: number): void {
    const { code, message } = this.extractErrorInfo(error);
    console.warn('[LLM-USAGE] Failed to persist usage batch', {
      code,
      message,
      recordCount,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * @deprecated Use LlmUsageLogger.getInstance() instead for better connection pooling
 */
export const usageLogger = LlmUsageLogger.getInstance();
