import { resolveProviderName } from './resolve-provider';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerTrackProviderCall(this: LlmUsageLoggerContext, model: string, success: boolean): void {
    const provider = resolveProviderName(model);
    this.providerStats.providerCalls[provider] =
      (this.providerStats.providerCalls[provider] || 0) + 1;
    if (success) {
      this.providerStats.providerSuccesses[provider] =
        (this.providerStats.providerSuccesses[provider] || 0) + 1;
    }
    if (provider === 'anthropic') {
      this.providerStats.claudeCalls++;
      if (success) this.providerStats.claudeSuccesses++;
      return;
    }
    if (provider === 'openrouter') {
      this.providerStats.openrouterCalls++;
      if (success) this.providerStats.openrouterSuccesses++;
      return;
    }
    if (provider === 'openai') {
      this.providerStats.openaiCalls++;
      if (success) this.providerStats.openaiSuccesses++;
    }
  }
