import { ProviderStats } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerGetProviderStats(this: LlmUsageLoggerContext): Readonly<ProviderStats> {
    return { ...this.providerStats };
  }
