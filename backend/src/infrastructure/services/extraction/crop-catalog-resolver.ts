import { z } from 'zod';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { type CropCatalogEntry } from './production-unit-normalizer';

export interface CropIdentificationInput {
  readonly cropName: string;
  readonly variety: string | null;
}

export interface CropIdentification {
  readonly species: string;
  readonly cropType: string;
  readonly code: string | null;
  readonly variety: string | null;
}

const BatchCropIdentificationSchema = z.object({
  crops: z.array(
    z.object({
      input: z.string(),
      species: z.string(),
      cropType: z.string(),
      code: z.string().nullable(),
      variety: z.string().nullable(),
    }),
  ),
});

const MAX_CATALOG_HINTS = 30;

function normalizeCropLabel(value: string): string {
  return value.toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildCropCacheKey(cropName: string, variety: string | null): string {
  const varietyPart = variety ? `|${variety.toLowerCase().trim()}` : '';
  return `${cropName.toLowerCase().trim()}${varietyPart}`;
}

/**
 * Exact match on cropType only — no substring/includes matching.
 */
export function exactCatalogMatch(
  cropName: string,
  catalog: readonly CropCatalogEntry[],
): CropCatalogEntry | null {
  const target = normalizeCropLabel(cropName);
  if (!target) return null;
  if (catalog.some((entry) => entry.species.toLowerCase() === target)) {
    return null;
  }
  return catalog.find((entry) => normalizeCropLabel(entry.cropType) === target) ?? null;
}

/**
 * Returns true when cropName still needs catalog/LLM resolution (AGEA labels, not Latin binomial).
 */
export function isUnresolvedCropName(
  cropName: string,
  catalog: readonly CropCatalogEntry[],
): boolean {
  const trimmed = cropName.trim();
  if (!trimmed) return false;
  if (catalog.some((entry) => entry.species.toLowerCase() === trimmed.toLowerCase())) {
    return false;
  }
  if (/^[A-Z][a-z]+ [a-z]/.test(trimmed)) {
    return false;
  }
  return true;
}

function getCatalogHints(
  cropName: string,
  catalog: readonly CropCatalogEntry[],
): readonly CropCatalogEntry[] {
  const target = normalizeCropLabel(cropName);
  if (!target) return [];
  const exact = catalog.filter((entry) => normalizeCropLabel(entry.cropType) === target);
  if (exact.length > 0) {
    return exact.slice(0, MAX_CATALOG_HINTS);
  }
  const tokenSet = new Set(target.split(' ').filter((token) => token.length >= 3));
  const scored = catalog
    .map((entry) => {
      const entryTokens = normalizeCropLabel(entry.cropType).split(' ');
      const overlap = entryTokens.filter((token) => tokenSet.has(token)).length;
      return { entry, overlap };
    })
    .filter((row) => row.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, MAX_CATALOG_HINTS).map((row) => row.entry);
}

export type BatchCropIdentificationResult = z.infer<typeof BatchCropIdentificationSchema>;

type BatchLlmInvoker = (
  messages: ReadonlyArray<{ role: 'system' | 'user'; content: string }>,
  options?: { callbacks?: BaseCallbackHandler[] },
) => Promise<BatchCropIdentificationResult>;

/**
 * Resolves crop names that remain unresolved after the primary batch LLM pass.
 */
export async function resolveUnresolvedCropsWithLlm(params: {
  readonly inputs: readonly CropIdentificationInput[];
  readonly catalog: readonly CropCatalogEntry[];
  readonly invokeBatch: BatchLlmInvoker;
  readonly callbacks?: ReadonlyArray<BaseCallbackHandler>;
}): Promise<readonly { input: CropIdentificationInput; identification: CropIdentification }[]> {
  const { inputs, catalog, invokeBatch, callbacks } = params;
  const unresolved = inputs.filter((input) => isUnresolvedCropName(input.cropName, catalog));
  const results: { input: CropIdentificationInput; identification: CropIdentification }[] = [];
  if (unresolved.length === 0) {
    return results;
  }
  const catalogHints = unresolved.flatMap((input) =>
    getCatalogHints(input.cropName, catalog).map(
      (entry) => `- ${entry.cropType} → ${entry.species} (${entry.code})`,
    ),
  );
  const uniqueHints = [...new Set(catalogHints)].slice(0, MAX_CATALOG_HINTS);
  const llmResult = await invokeBatch(
    [
      {
        role: 'system',
        content: `You are an agricultural expert. Map Italian crop labels to scientific names.
IMPORTANT: "Melo" (apple) is Malus domestica — NOT melone (Cucumis melo).
Use catalog hints when they match exactly. Do not guess if uncertain — use the input as species.`,
      },
      {
        role: 'user',
        content: `Catalog hints (exact matches preferred):
${uniqueHints.join('\n') || 'none'}

Identify these crops:
${unresolved
  .map((input, index) => {
    const varietyStr = input.variety ? ` (variety: ${input.variety})` : '';
    return `${index + 1}. "${input.cropName}"${varietyStr}`;
  })
  .join('\n')}`,
      },
    ],
    { callbacks: callbacks ? [...callbacks] : undefined },
  );
  for (let i = 0; i < llmResult.crops.length; i += 1) {
    const crop = llmResult.crops[i];
    const original = unresolved[i];
    if (!original) continue;
    results.push({
      input: original,
      identification: {
        species: crop.species,
        cropType: crop.cropType,
        code: crop.code,
        variety: crop.variety ?? original.variety,
      },
    });
  }
  return results;
}

/**
 * Applies exact catalog match as final deterministic fallback (no substring matching).
 */
export function applyExactCatalogFallback(
  cropName: string | null,
  catalog: readonly CropCatalogEntry[],
): { species: string; code: string } | null {
  if (!cropName) return null;
  const matched = exactCatalogMatch(cropName, catalog);
  if (!matched) return null;
  return { species: matched.species, code: matched.code };
}
