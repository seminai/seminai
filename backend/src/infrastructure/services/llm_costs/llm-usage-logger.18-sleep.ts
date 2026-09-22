import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerSleep(this: LlmUsageLoggerContext, ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
