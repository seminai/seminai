import { ModelPricingRegistry } from '../usage';
import { OpenRouterPricingStore } from '../openrouter-pricing-store';

describe('OpenRouterPricingStore', () => {
  beforeEach(() => {
    ModelPricingRegistry.clearCache();
  });

  it('loads pricing by OpenRouter slug', () => {
    const pricing = OpenRouterPricingStore.getPricing('openai/gpt-4o-mini');
    expect(pricing).not.toBeNull();
    expect(pricing?.inputPerTokenUsd).toBeCloseTo(0.15 / 1_000_000, 12);
    expect(pricing?.outputPerTokenUsd).toBeCloseTo(0.6 / 1_000_000, 12);
    expect(pricing?.cachedInputDiscount).toBeCloseTo(0.5, 6);
  });

  it('loads pricing by normalized model id', () => {
    const pricing = OpenRouterPricingStore.getPricing('gpt-4o');
    expect(pricing).not.toBeNull();
    expect(pricing?.inputPerTokenUsd).toBeCloseTo(2.5 / 1_000_000, 12);
    expect(pricing?.outputPerTokenUsd).toBeCloseTo(10 / 1_000_000, 12);
  });

  it('prefers OpenRouter pricing in ModelPricingRegistry', () => {
    const pricing = ModelPricingRegistry.getPricing('anthropic/claude-haiku-4.5');
    expect(pricing.inputPerTokenUsd).toBeCloseTo(1 / 1_000_000, 12);
    expect(pricing.outputPerTokenUsd).toBeCloseTo(5 / 1_000_000, 12);
    expect(pricing.cachedInputDiscount).toBeCloseTo(0.1, 6);
  });
});
