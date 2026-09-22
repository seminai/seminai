import * as fs from 'fs';
import * as path from 'path';
import { normalizeModelNameForPricing } from './model-name-normalize';
import { OpenRouterPricingStore } from './openrouter-pricing-store';
import type { Pricing } from './pricing-types';

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
