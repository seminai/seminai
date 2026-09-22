import { getAnalyticsService } from '../analytics/analytics-service.singleton';
import { resolveProviderName } from './resolve-provider';
import { TokenUsage } from './usage';
import { LlmUsageMetadata } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerEmitAnalytics(this: LlmUsageLoggerContext, tokens: TokenUsage, totalCostUsd: number, meta: LlmUsageMetadata): void {
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
