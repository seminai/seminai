import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { LangChainUsageCollector, UsageAccumulator } from './usage';
import { UsageTracker } from './llm-usage-logger.support';
import type { LlmUsageLoggerContext } from './llm-usage-logger.context';

export function llmUsageLoggerCreateTracker(this: LlmUsageLoggerContext, callbacks?: ReadonlyArray<BaseCallbackHandler>): UsageTracker {
    const accumulator = new UsageAccumulator();
    const collector = new LangChainUsageCollector(accumulator);
    const mergedCallbacks: BaseCallbackHandler[] =
      Array.isArray(callbacks) && callbacks.length > 0 ? [...callbacks, collector] : [collector];
    return { accumulator, callbacks: mergedCallbacks };
  }
