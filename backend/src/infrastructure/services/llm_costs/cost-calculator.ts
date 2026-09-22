import type { Pricing } from './pricing-types';
import type { TokenUsage } from './usage-accumulator';
import { ModelPricingRegistry } from './model-pricing-registry';

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
