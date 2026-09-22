import { FALLBACK_RATE_ALERT_THRESHOLD } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerCheckFallbackRateAlert(this: LlmUsageLoggerContext): void {
    const totalClaude = this.providerStats.claudeCalls;
    if (totalClaude < 10) return;
    const failRate = 1 - this.providerStats.claudeSuccesses / totalClaude;
    if (failRate > FALLBACK_RATE_ALERT_THRESHOLD) {
      console.error(
        `[LLM-USAGE-ALERT] Claude fallback rate ${(failRate * 100).toFixed(1)}% exceeds ${FALLBACK_RATE_ALERT_THRESHOLD * 100}% threshold. ` +
          `Stats: ${this.providerStats.claudeSuccesses}/${totalClaude} successful, ${this.providerStats.fallbackEvents} fallbacks.`,
      );
    }
  }
