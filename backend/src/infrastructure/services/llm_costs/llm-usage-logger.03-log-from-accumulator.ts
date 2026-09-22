import { UsageAccumulator } from './usage';
import { LlmUsageMetadata } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export async function llmUsageLoggerLogFromAccumulator(this: LlmUsageLoggerContext, accumulator: UsageAccumulator, meta: LlmUsageMetadata): Promise<void> {
    this.trackProviderCall(meta.model, true);
    await this.logFromUsage(accumulator.getTotals(), meta);
  }
