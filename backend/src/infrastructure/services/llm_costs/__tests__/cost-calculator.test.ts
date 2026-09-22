import { CostCalculator, ModelPricingRegistry, type Pricing } from '../usage';

function pricing(overrides: Partial<Pricing> = {}): Pricing {
  return {
    inputPerTokenUsd: 1 / 1_000_000,
    outputPerTokenUsd: 4 / 1_000_000,
    cachedInputDiscount: 0.5,
    ...overrides,
  };
}

describe('CostCalculator cached input discount', () => {
  it('charges cached tokens at the discounted rate', () => {
    const result = CostCalculator.computeCost({
      tokens: {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cachedPromptTokens: 500_000,
      },
      pricing: pricing({ cachedInputDiscount: 0.5 }),
      margin: 0,
    });
    // 500k uncached * $1/M + 500k cached * $1/M * 0.5 = 0.5 + 0.25 = 0.75
    expect(result.llmCostUsd).toBeCloseTo(0.75, 6);
  });

  it('uses the per-model discount (e.g. Claude 0.1) when provided', () => {
    const result = CostCalculator.computeCost({
      tokens: {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cachedPromptTokens: 1_000_000,
      },
      pricing: pricing({ cachedInputDiscount: 0.1 }),
      margin: 0,
    });
    // 0 uncached + 1M cached * $1/M * 0.1 = 0.1
    expect(result.llmCostUsd).toBeCloseTo(0.1, 6);
  });

  it('clamps cachedPromptTokens above promptTokens', () => {
    const result = CostCalculator.computeCost({
      tokens: {
        promptTokens: 100,
        completionTokens: 0,
        totalTokens: 100,
        // Provider misreport: more cached than prompt. Must clamp to promptTokens.
        cachedPromptTokens: 1000,
      },
      pricing: pricing({ cachedInputDiscount: 0.5 }),
      margin: 0,
    });
    // 0 uncached + 100 cached * $1/M * 0.5
    expect(result.llmCostUsd).toBeCloseTo(100 * (1 / 1_000_000) * 0.5, 9);
  });

  it('falls back to full rate when no cached tokens are reported', () => {
    const result = CostCalculator.computeCost({
      tokens: {
        promptTokens: 1_000_000,
        completionTokens: 0,
        totalTokens: 1_000_000,
        cachedPromptTokens: 0,
      },
      pricing: pricing({ cachedInputDiscount: 0.5 }),
      margin: 0,
    });
    expect(result.llmCostUsd).toBeCloseTo(1.0, 6);
  });
});

describe('ModelPricingRegistry cachedInputDiscount resolution', () => {
  it('defaults OpenAI models to 0.5', () => {
    const p = ModelPricingRegistry.getPricing('gpt-4o-mini');
    expect(p.cachedInputDiscount).toBe(0.5);
  });

  it('resolves Claude models to 0.1', () => {
    const p = ModelPricingRegistry.getPricing('claude-4.5-sonnet');
    expect(p.cachedInputDiscount).toBe(0.1);
  });

  it('applies the Claude fallback even for unknown claude-* names', () => {
    // Not in llm_cost.json, but the name contains "claude" so the resolver applies 0.1.
    const p = ModelPricingRegistry.getPricing('claude-sonnet-4-20250514');
    expect(p.cachedInputDiscount).toBe(0.1);
  });

  it('uses default 0.5 for unknown non-Claude models', () => {
    const p = ModelPricingRegistry.getPricing('mystery-future-model-9000');
    expect(p.cachedInputDiscount).toBe(0.5);
  });
});
