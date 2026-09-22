export interface OpenRouterPricingEntry {
  readonly inputPerMillionTokens: number;
  readonly outputPerMillionTokens: number;
  readonly cachedInputDiscount?: number;
}

export interface OpenRouterPricingFile {
  readonly syncedAt: string;
  readonly sourceUrl: string;
  readonly modelCount: number;
  readonly modelsBySlug: Record<string, OpenRouterPricingEntry>;
  readonly modelsByNormalized: Record<string, OpenRouterPricingEntry>;
}

export interface OpenRouterApiModelPricing {
  readonly prompt?: string;
  readonly completion?: string;
  readonly input_cache_read?: string;
}

export interface OpenRouterApiModel {
  readonly id: string;
  readonly pricing?: OpenRouterApiModelPricing;
}

export interface OpenRouterApiModelsResponse {
  readonly data: readonly OpenRouterApiModel[];
}
