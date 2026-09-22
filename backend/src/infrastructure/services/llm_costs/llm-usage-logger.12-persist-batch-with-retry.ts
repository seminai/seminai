import { UsageRecord, MAX_RETRIES, INITIAL_BACKOFF_MS } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export async function llmUsageLoggerPersistBatchWithRetry(this: LlmUsageLoggerContext, records: UsageRecord[]): Promise<void> {
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
