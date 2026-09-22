import { FallbackEventMeta } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerLogFallbackEvent(this: LlmUsageLoggerContext, meta: FallbackEventMeta): void {
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
