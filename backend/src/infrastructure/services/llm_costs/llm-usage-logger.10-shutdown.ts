import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export async function llmUsageLoggerShutdown(this: LlmUsageLoggerContext, options: { readonly flushPending?: boolean } = {}): Promise<void> {
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
