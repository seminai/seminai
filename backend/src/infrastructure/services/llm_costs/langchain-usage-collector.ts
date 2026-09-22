import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { LLMResult } from '@langchain/core/outputs';
import {
  UsageAccumulator,
  type UsageAccumulatorProps,
  type TokenUsage,
} from './usage-accumulator';

type CachedTokensCarrier = {
  readonly promptCachedTokens?: number;
  readonly cachedPromptTokens?: number;
  readonly cache_read_input_tokens?: number;
  readonly prompt_tokens_details?: { readonly cached_tokens?: number };
};

function extractCachedPromptTokens(carrier: CachedTokensCarrier | undefined | null): number {
  if (!carrier) return 0;
  return (
    carrier.promptCachedTokens ??
    carrier.cachedPromptTokens ??
    carrier.prompt_tokens_details?.cached_tokens ??
    carrier.cache_read_input_tokens ??
    0
  );
}

export class LangChainUsageCollector extends BaseCallbackHandler {
  public readonly name: string = 'LangChainUsageCollector';
  private readonly accumulator: UsageAccumulator;

  constructor(accumulator?: UsageAccumulator) {
    super();
    this.accumulator = accumulator ?? new UsageAccumulator();
  }

  public async handleLLMEnd(output: LLMResult): Promise<void> {
    this.recordUsage(output);
  }

  // Backward compatibility with older LangChain callback names
  // istanbul ignore next
  public onLLMEnd(output: LLMResult): void {
    this.recordUsage(output);
  }

  private recordUsage(output: LLMResult): void {
    // LangChain LLMResult may expose token usage in different shapes depending on integration
    const llmOutputUsage = (
      output.llmOutput as unknown as
        | {
            tokenUsage?: UsageAccumulatorProps & {
              promptCachedTokens?: number;
              prompt_tokens_details?: { cached_tokens?: number };
            };
          }
        | undefined
    )?.tokenUsage;
    if (llmOutputUsage) {
      this.accumulator.add({
        promptTokens: llmOutputUsage.promptTokens ?? 0,
        completionTokens: llmOutputUsage.completionTokens ?? 0,
        totalTokens: llmOutputUsage.totalTokens ?? 0,
        cachedPromptTokens: extractCachedPromptTokens(llmOutputUsage),
      });
      return;
    }

    try {
      const generation = output.generations?.[0]?.[0] as unknown as {
        message?: {
          response_metadata?: {
            tokenUsage?: UsageAccumulatorProps & {
              promptCachedTokens?: number;
              prompt_tokens_details?: { cached_tokens?: number };
            };
            usage?: UsageAccumulatorProps & {
              input_tokens?: number;
              output_tokens?: number;
              total_tokens?: number;
              prompt_tokens_details?: { cached_tokens?: number };
              cache_read_input_tokens?: number;
            };
          };
          usage_metadata?: {
            input_tokens?: number;
            output_tokens?: number;
            total_tokens?: number;
            input_token_details?: { cache_read?: number };
          };
        };
      };
      const message = generation?.message;
      const meta = message?.response_metadata;
      const metaUsage = (meta?.tokenUsage || meta?.usage) ?? undefined;
      const usageMetadata = message?.usage_metadata;
      if (metaUsage || usageMetadata) {
        const promptTokens =
          (metaUsage as unknown as { promptTokens?: number; input_tokens?: number })
            ?.promptTokens ??
          (metaUsage as unknown as { input_tokens?: number })?.input_tokens ??
          usageMetadata?.input_tokens ??
          0;
        const completionTokens =
          (metaUsage as unknown as { completionTokens?: number; output_tokens?: number })
            ?.completionTokens ??
          (metaUsage as unknown as { output_tokens?: number })?.output_tokens ??
          usageMetadata?.output_tokens ??
          0;
        const totalTokens =
          (metaUsage as unknown as { totalTokens?: number; total_tokens?: number })?.totalTokens ??
          (metaUsage as unknown as { total_tokens?: number })?.total_tokens ??
          usageMetadata?.total_tokens ??
          promptTokens + completionTokens;
        const cachedPromptTokens =
          extractCachedPromptTokens(metaUsage) ||
          usageMetadata?.input_token_details?.cache_read ||
          0;
        this.accumulator.add({
          promptTokens,
          completionTokens,
          totalTokens,
          cachedPromptTokens,
        });
      }
    } catch (_err) {
      // swallow: best-effort accounting
    }
  }

  public getTotals(): TokenUsage {
    return this.accumulator.getTotals();
  }
}
