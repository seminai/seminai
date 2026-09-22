import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerLogPersistError(this: LlmUsageLoggerContext, error: unknown, recordCount: number): void {
    const { code, message } = this.extractErrorInfo(error);
    console.warn('[LLM-USAGE] Failed to persist usage batch', {
      code,
      message,
      recordCount,
    });
  }
