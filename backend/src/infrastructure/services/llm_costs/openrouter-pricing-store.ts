import * as fs from 'fs';
import * as path from 'path';
import { normalizeModelNameForPricing } from './model-name-normalize';
import type { OpenRouterPricingEntry, OpenRouterPricingFile } from './openrouter-pricing-types';
import type { Pricing } from './pricing-types';

const OPENROUTER_PRICING_FILENAME = 'openrouter_pricing.json';

export class OpenRouterPricingStore {
  private static cachedFile: OpenRouterPricingFile | null = null;

  public static getPricing(modelName: string): Pricing | null {
    const file = OpenRouterPricingStore.loadFile();
    if (!file) {
      return null;
    }
    const slugKey = (modelName || '').trim().toLowerCase();
    const entry =
      file.modelsBySlug[slugKey] ??
      file.modelsByNormalized[normalizeModelNameForPricing(modelName)];
    if (!entry) {
      return null;
    }
    return OpenRouterPricingStore.toPricing(entry, normalizeModelNameForPricing(modelName));
  }

  public static loadFile(): OpenRouterPricingFile | null {
    if (OpenRouterPricingStore.cachedFile) {
      return OpenRouterPricingStore.cachedFile;
    }
    const configPath = OpenRouterPricingStore.resolveConfigPath();
    if (!configPath) {
      return null;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as OpenRouterPricingFile;
      OpenRouterPricingStore.cachedFile = parsed;
      return parsed;
    } catch (error) {
      console.warn(
        `[OpenRouterPricingStore] Failed to load ${OPENROUTER_PRICING_FILENAME}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  public static clearCache(): void {
    OpenRouterPricingStore.cachedFile = null;
  }

  private static resolveConfigPath(): string | null {
    const candidates = [
      path.join(__dirname, OPENROUTER_PRICING_FILENAME),
      path.join(
        process.cwd(),
        'dist',
        'infrastructure',
        'services',
        'llm_costs',
        OPENROUTER_PRICING_FILENAME,
      ),
      path.join(
        process.cwd(),
        'src',
        'infrastructure',
        'services',
        'llm_costs',
        OPENROUTER_PRICING_FILENAME,
      ),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private static toPricing(entry: OpenRouterPricingEntry, normalizedModelName: string): Pricing {
    return {
      inputPerTokenUsd: entry.inputPerMillionTokens / 1_000_000,
      outputPerTokenUsd: entry.outputPerMillionTokens / 1_000_000,
      cachedInputDiscount: OpenRouterPricingStore.resolveCachedDiscount(
        normalizedModelName,
        entry.cachedInputDiscount,
      ),
    };
  }

  private static resolveCachedDiscount(
    normalizedModelName: string,
    configured: number | undefined,
  ): number {
    if (typeof configured === 'number') {
      return configured;
    }
    if (normalizedModelName.includes('claude')) {
      return 0.1;
    }
    return 0.5;
  }
}
