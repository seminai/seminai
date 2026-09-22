import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export async function llmUsageLoggerFlush(this: LlmUsageLoggerContext): Promise<void> {
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
