import { FLUSH_INTERVAL_MS } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerStartFlushTimer(this: LlmUsageLoggerContext): void {
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
