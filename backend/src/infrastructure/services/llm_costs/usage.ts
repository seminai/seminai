import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { LLMResult } from '@langchain/core/outputs';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeModelNameForPricing } from './model-name-normalize';
import { OpenRouterPricingStore } from './openrouter-pricing-store';
import type { Pricing } from './pricing-types';

export type { Pricing } from './pricing-types';

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  /**
   * Subset of promptTokens served from the provider's prompt cache.
   * OpenAI: usage.prompt_tokens_details.cached_tokens. Charged at ~50% of
   * the standard input rate on models that support automatic prompt caching.
   */
  readonly cachedPromptTokens: number;
}

export interface UsageAccumulatorProps {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly cachedPromptTokens?: number;
  readonly mistralOcrPages?: number;
  readonly tavilyCalls?: number;
}

export class UsageAccumulator {
  private prompt: number;
  private completion: number;
  private total: number;
  private cachedPrompt: number;
  private mistralPages: number;
  private tavilyCalls: number;

  constructor(initial?: UsageAccumulatorProps) {
    this.prompt = initial?.promptTokens ?? 0;
    this.completion = initial?.completionTokens ?? 0;
    this.total = initial?.totalTokens ?? 0;
    this.cachedPrompt = initial?.cachedPromptTokens ?? 0;
    this.mistralPages = initial?.mistralOcrPages ?? 0;
    this.tavilyCalls = initial?.tavilyCalls ?? 0;
  }

  public add(usage: UsageAccumulatorProps): void {
    this.prompt += usage.promptTokens ?? 0;
    this.completion += usage.completionTokens ?? 0;
    this.total += usage.totalTokens ?? 0;
    this.cachedPrompt += usage.cachedPromptTokens ?? 0;
    this.mistralPages += usage.mistralOcrPages ?? 0;
    this.tavilyCalls += usage.tavilyCalls ?? 0;
  }

  public addMistralOcrPage(): void {
    this.mistralPages += 1;
  }

  public addTavilyCall(): void {
    this.tavilyCalls += 1;
  }

  public getTotals(): TokenUsage {
    return {
      promptTokens: this.prompt,
      completionTokens: this.completion,
      totalTokens: this.total || this.prompt + this.completion,
      cachedPromptTokens: this.cachedPrompt,
    };
  }

  public getMistralOcrPages(): number {
    return this.mistralPages;
  }

  public getTavilyCalls(): number {
    return this.tavilyCalls;
  }
}

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

interface ModelPricingConfig {
  readonly inputPerMillionTokens: number;
  readonly outputPerMillionTokens: number;
  /** Optional per-model override of the cached-input discount fraction. */
  readonly cachedInputDiscount?: number;
}

/** Provider-level fallbacks used when a model entry doesn't specify a discount. */
const OPENAI_CACHED_INPUT_DISCOUNT = 0.5;
const ANTHROPIC_CACHED_INPUT_DISCOUNT = 0.1;
const DEFAULT_CACHED_INPUT_DISCOUNT = OPENAI_CACHED_INPUT_DISCOUNT;

function resolveCachedInputDiscount(
  normalizedModelName: string,
  configValue: number | undefined,
): number {
  if (typeof configValue === 'number') return configValue;
  if (normalizedModelName.includes('claude')) return ANTHROPIC_CACHED_INPUT_DISCOUNT;
  return DEFAULT_CACHED_INPUT_DISCOUNT;
}

interface LlmCostConfig {
  readonly models: Record<string, ModelPricingConfig>;
  readonly services: {
    readonly tavily?: { readonly costPerCall: number };
    readonly 'mistral-ocr'?: { readonly costPer1000Pages: number };
  };
}

export class ModelPricingRegistry {
  private static cachedConfig: LlmCostConfig | null = null;

  public static clearCache(): void {
    ModelPricingRegistry.cachedConfig = null;
    OpenRouterPricingStore.clearCache();
  }

  private static loadConfig(): LlmCostConfig {
    if (ModelPricingRegistry.cachedConfig) {
      return ModelPricingRegistry.cachedConfig;
    }
    // Try multiple paths to support both development and production builds
    const possiblePaths = [
      path.join(__dirname, 'llm_cost.json'), // Production (dist/infrastructure/services/llm_costs/)
      path.join(process.cwd(), 'dist', 'infrastructure', 'services', 'llm_costs', 'llm_cost.json'), // Production alternative
      path.join(process.cwd(), 'src', 'infrastructure', 'services', 'llm_costs', 'llm_cost.json'), // Development
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        'src',
        'infrastructure',
        'services',
        'llm_costs',
        'llm_cost.json',
      ), // Development alternative
    ];
    for (const configPath of possiblePaths) {
      try {
        if (fs.existsSync(configPath)) {
          const fileContent = fs.readFileSync(configPath, 'utf-8');
          const config = JSON.parse(fileContent) as LlmCostConfig;
          ModelPricingRegistry.cachedConfig = config;
          return config;
        }
      } catch (_err) {
        // Try next path
      }
    }
    console.warn(
      `[ModelPricingRegistry] Failed to load pricing config from any path, using fallback pricing`,
    );
    return {
      models: {},
      services: {},
    };
  }

  public static getPricing(modelName: string): Pricing {
    const openRouterPricing = OpenRouterPricingStore.getPricing(modelName);
    if (openRouterPricing) {
      return openRouterPricing;
    }
    const config = ModelPricingRegistry.loadConfig();
    const normalized = ModelPricingRegistry.normalizeModelName(modelName);
    const modelConfig = config.models[normalized];
    if (modelConfig) {
      return ModelPricingRegistry.fromPerMillion({
        inputUsdPerMillion: modelConfig.inputPerMillionTokens,
        outputUsdPerMillion: modelConfig.outputPerMillionTokens,
        modelNameNormalized: normalized,
        cachedInputDiscount: modelConfig.cachedInputDiscount,
      });
    }
    // Fallback: try partial matching for backward compatibility
    const fallbackPricing = ModelPricingRegistry.findFallbackPricing(normalized, config);
    if (fallbackPricing) {
      return fallbackPricing;
    }
    // Default conservative fallback
    return ModelPricingRegistry.fromPerMillion({
      inputUsdPerMillion: 5,
      outputUsdPerMillion: 15,
      modelNameNormalized: normalized,
    });
  }

  private static normalizeModelName(modelName: string): string {
    return normalizeModelNameForPricing(modelName);
  }

  private static findFallbackPricing(normalized: string, config: LlmCostConfig): Pricing | null {
    // Try to find a model that contains the normalized name
    for (const [key, value] of Object.entries(config.models)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return ModelPricingRegistry.fromPerMillion({
          inputUsdPerMillion: value.inputPerMillionTokens,
          outputUsdPerMillion: value.outputPerMillionTokens,
          modelNameNormalized: normalized,
          cachedInputDiscount: value.cachedInputDiscount,
        });
      }
    }
    // Legacy fallbacks for common patterns
    if (normalized.includes('gpt-4o-mini')) {
      const miniConfig = config.models['gpt-4o-mini'];
      if (miniConfig) {
        return ModelPricingRegistry.fromPerMillion({
          inputUsdPerMillion: miniConfig.inputPerMillionTokens,
          outputUsdPerMillion: miniConfig.outputPerMillionTokens,
          modelNameNormalized: normalized,
          cachedInputDiscount: miniConfig.cachedInputDiscount,
        });
      }
    }
    if (normalized.includes('claude-sonnet-4')) {
      const claudeConfig = config.models['claude-4-sonnet'];
      if (claudeConfig) {
        return ModelPricingRegistry.fromPerMillion({
          inputUsdPerMillion: claudeConfig.inputPerMillionTokens,
          outputUsdPerMillion: claudeConfig.outputPerMillionTokens,
          modelNameNormalized: normalized,
          cachedInputDiscount: claudeConfig.cachedInputDiscount,
        });
      }
    }
    if (normalized.includes('claude-haiku-4.5')) {
      const claudeConfig = config.models['claude-4.5-haiku'];
      if (claudeConfig) {
        return ModelPricingRegistry.fromPerMillion({
          inputUsdPerMillion: claudeConfig.inputPerMillionTokens,
          outputUsdPerMillion: claudeConfig.outputPerMillionTokens,
          modelNameNormalized: normalized,
          cachedInputDiscount: claudeConfig.cachedInputDiscount,
        });
      }
    }
    if (normalized.includes('gpt-4o') && !normalized.includes('mini')) {
      const gpt4oConfig = config.models['gpt-4o'];
      if (gpt4oConfig) {
        return ModelPricingRegistry.fromPerMillion({
          inputUsdPerMillion: gpt4oConfig.inputPerMillionTokens,
          outputUsdPerMillion: gpt4oConfig.outputPerMillionTokens,
          modelNameNormalized: normalized,
          cachedInputDiscount: gpt4oConfig.cachedInputDiscount,
        });
      }
    }
    if (normalized.includes('gpt-4.1')) {
      const gpt41Config = config.models['gpt-4.1'];
      if (gpt41Config) {
        return ModelPricingRegistry.fromPerMillion({
          inputUsdPerMillion: gpt41Config.inputPerMillionTokens,
          outputUsdPerMillion: gpt41Config.outputPerMillionTokens,
          modelNameNormalized: normalized,
          cachedInputDiscount: gpt41Config.cachedInputDiscount,
        });
      }
    }
    if (normalized.includes('gpt-3.5')) {
      return ModelPricingRegistry.fromPerMillion({
        inputUsdPerMillion: 0.5,
        outputUsdPerMillion: 1.5,
        modelNameNormalized: normalized,
      });
    }
    return null;
  }

  private static fromPerMillion(params: {
    readonly inputUsdPerMillion: number;
    readonly outputUsdPerMillion: number;
    readonly modelNameNormalized: string;
    readonly cachedInputDiscount?: number;
  }): Pricing {
    return {
      inputPerTokenUsd: params.inputUsdPerMillion / 1_000_000,
      outputPerTokenUsd: params.outputUsdPerMillion / 1_000_000,
      cachedInputDiscount: resolveCachedInputDiscount(
        params.modelNameNormalized,
        params.cachedInputDiscount,
      ),
    };
  }

  public static getTavilyCostPerCall(): number {
    const config = ModelPricingRegistry.loadConfig();
    return config.services.tavily?.costPerCall ?? 0.008;
  }

  public static getMistralOcrCostPer1000Pages(): number {
    const config = ModelPricingRegistry.loadConfig();
    return config.services['mistral-ocr']?.costPer1000Pages ?? 1.0;
  }
}

/**
 * @deprecated Use ModelPricingRegistry instead
 */
export class OpenAiPricingRegistry {
  public static getPricing(modelName: string): Pricing {
    return ModelPricingRegistry.getPricing(modelName);
  }
}

export interface CostPerTokenUsd {
  readonly inputUsd: number;
  readonly outputUsd: number;
}

export interface CostSummary {
  readonly tokens: TokenUsage;
  readonly costPerToken: CostPerTokenUsd;
  readonly llmCostUsd: number;
  readonly mistralOcrPages: number;
  readonly mistralOcrCostUsd: number;
  readonly tavilyCalls: number;
  readonly tavilyCostUsd: number;
  readonly totalCostUsd: number;
  readonly margin: number;
  readonly costWithMarginUsd: number;
}

export class CostCalculator {
  public static computeCost(params: {
    readonly tokens: TokenUsage;
    readonly pricing: Pricing;
    readonly mistralOcrPages?: number;
    readonly tavilyCalls?: number;
    readonly margin?: number;
  }): CostSummary {
    const margin: number = typeof params.margin === 'number' ? params.margin : 0.2;
    const mistralPages: number = params.mistralOcrPages ?? 0;
    const tavilyCalls: number = params.tavilyCalls ?? 0;
    const cachedPrompt: number = Math.min(
      params.tokens.cachedPromptTokens,
      params.tokens.promptTokens,
    );
    const uncachedPrompt: number = params.tokens.promptTokens - cachedPrompt;
    const inputCost: number =
      uncachedPrompt * params.pricing.inputPerTokenUsd +
      cachedPrompt * params.pricing.inputPerTokenUsd * params.pricing.cachedInputDiscount;
    const outputCost: number = params.tokens.completionTokens * params.pricing.outputPerTokenUsd;
    const llmCostUsd: number = inputCost + outputCost;
    const mistralOcrCostPer1000Pages: number = ModelPricingRegistry.getMistralOcrCostPer1000Pages();
    const mistralOcrCostUsd: number = (mistralPages / 1000) * mistralOcrCostPer1000Pages;
    const tavilyCostPerCall: number = ModelPricingRegistry.getTavilyCostPerCall();
    const tavilyCostUsd: number = tavilyCalls * tavilyCostPerCall;
    const totalCostUsd: number = llmCostUsd + mistralOcrCostUsd + tavilyCostUsd;
    const costWithMarginUsd: number = totalCostUsd * (1 + margin);
    return {
      tokens: params.tokens,
      costPerToken: {
        inputUsd: params.pricing.inputPerTokenUsd,
        outputUsd: params.pricing.outputPerTokenUsd,
      },
      llmCostUsd,
      mistralOcrPages: mistralPages,
      mistralOcrCostUsd,
      tavilyCalls,
      tavilyCostUsd,
      totalCostUsd,
      margin,
      costWithMarginUsd,
    };
  }
}
