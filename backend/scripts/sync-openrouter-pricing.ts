/**
 * Fetches live model pricing from OpenRouter and writes openrouter_pricing.json.
 * @see https://openrouter.ai/docs/api/api-reference/models/get-models
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { normalizeModelNameForPricing } from '../src/infrastructure/services/llm_costs/model-name-normalize';
import type {
  OpenRouterApiModel,
  OpenRouterApiModelsResponse,
  OpenRouterPricingEntry,
  OpenRouterPricingFile,
} from '../src/infrastructure/services/llm_costs/openrouter-pricing-types';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OUTPUT_DIR = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'src',
  'infrastructure',
  'services',
  'llm_costs',
);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'openrouter_pricing.json');
const SNAPSHOT_FILE = path.join(OUTPUT_DIR, 'openrouter-models.snapshot.json');

function parsePerMillion(tokenPrice: string | undefined): number | null {
  if (!tokenPrice) {
    return null;
  }
  const perToken = Number.parseFloat(tokenPrice);
  if (!Number.isFinite(perToken) || perToken < 0) {
    return null;
  }
  return perToken * 1_000_000;
}

function buildEntry(model: OpenRouterApiModel): OpenRouterPricingEntry | null {
  const inputPerMillion = parsePerMillion(model.pricing?.prompt);
  const outputPerMillion = parsePerMillion(model.pricing?.completion);
  if (inputPerMillion === null && outputPerMillion === null) {
    return null;
  }
  const entry: OpenRouterPricingEntry = {
    inputPerMillionTokens: inputPerMillion ?? 0,
    outputPerMillionTokens: outputPerMillion ?? 0,
  };
  const promptPerToken = Number.parseFloat(model.pricing?.prompt ?? '');
  const cacheReadPerToken = Number.parseFloat(model.pricing?.input_cache_read ?? '');
  if (
    Number.isFinite(promptPerToken) &&
    promptPerToken > 0 &&
    Number.isFinite(cacheReadPerToken) &&
    cacheReadPerToken >= 0
  ) {
    return {
      ...entry,
      cachedInputDiscount: Math.min(1, cacheReadPerToken / promptPerToken),
    };
  }
  return entry;
}

async function fetchModels(): Promise<OpenRouterApiModelsResponse> {
  const response = await fetch(OPENROUTER_MODELS_URL);
  if (!response.ok) {
    throw new Error(`OpenRouter API ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as OpenRouterApiModelsResponse;
}

function buildPricingFile(models: readonly OpenRouterApiModel[]): OpenRouterPricingFile {
  const modelsBySlug: Record<string, OpenRouterPricingEntry> = {};
  const modelsByNormalized: Record<string, OpenRouterPricingEntry> = {};
  const collisions = new Map<string, string[]>();

  for (const model of models) {
    const entry = buildEntry(model);
    if (!entry) {
      continue;
    }
    const slug = model.id.trim().toLowerCase();
    modelsBySlug[slug] = entry;
    const normalized = normalizeModelNameForPricing(slug);
    const existing = modelsByNormalized[normalized];
    if (existing && JSON.stringify(existing) !== JSON.stringify(entry)) {
      const list = collisions.get(normalized) ?? [slug];
      list.push(slug);
      collisions.set(normalized, list);
    }
    modelsByNormalized[normalized] = entry;
  }

  if (collisions.size > 0) {
    console.warn(
      `[sync-openrouter-pricing] ${collisions.size} normalized id collision(s); last slug wins.`,
    );
  }

  return {
    syncedAt: new Date().toISOString(),
    sourceUrl: OPENROUTER_MODELS_URL,
    modelCount: Object.keys(modelsBySlug).length,
    modelsBySlug,
    modelsByNormalized,
  };
}

async function main(): Promise<void> {
  console.log(`Fetching ${OPENROUTER_MODELS_URL}...`);
  const payload = await fetchModels();
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`Snapshot saved: ${SNAPSHOT_FILE} (${payload.data.length} models)`);

  const pricingFile = buildPricingFile(payload.data);
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(pricingFile, null, 2)}\n`, 'utf-8');
  console.log(`Pricing written: ${OUTPUT_FILE} (${pricingFile.modelCount} priced models)`);

  const samples = [
    'openai/gpt-4o-mini',
    'openai/gpt-4o',
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-sonnet-4',
  ];
  for (const slug of samples) {
    const entry = pricingFile.modelsBySlug[slug];
    if (entry) {
      console.log(
        `  ${slug}: in=$${entry.inputPerMillionTokens}/M out=$${entry.outputPerMillionTokens}/M` +
          (entry.cachedInputDiscount !== undefined
            ? ` cache=${(entry.cachedInputDiscount * 100).toFixed(0)}%`
            : ''),
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error('[sync-openrouter-pricing] Failed:', error);
  process.exit(1);
});
