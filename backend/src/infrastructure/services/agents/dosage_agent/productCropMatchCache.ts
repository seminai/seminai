/**
 * Cache layer for product↔crop LLM matching.
 *
 * Why: a single dosage job can fire 14-50+ `llmMatchProductToCrop` calls in a
 * burst (one per stock product × crop). The result depends on the product
 * label (semi-static — changes only when SIAN re-publishes the etichetta) and
 * the target crop taxonomy. Caching by the SIAN registration number gives a
 * stable key that's shared across users.
 *
 * Storage: `ProductCropMatchCache` Prisma model. TTL via `updatedAt` age check.
 */
import { prisma } from '../../../repositories/Prisma';

export interface CachedMatchResult {
  readonly isCompatible: boolean;
  readonly confidence: number;
  readonly reason: string;
  readonly matchedCrops: ReadonlyArray<string>;
}

const DEFAULT_TTL_DAYS = 30;

function getTtlMs(): number {
  const raw = process.env.PRODUCT_CROP_MATCH_CACHE_TTL_DAYS;
  const days = raw ? Number(raw) : DEFAULT_TTL_DAYS;
  const finalDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
  return finalDays * 24 * 60 * 60 * 1000;
}

export function normalizeKey(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

interface CacheKey {
  readonly registrationNumber: string;
  readonly cropNameNorm: string;
  readonly varietyNorm: string;
}

function buildKey(
  registrationNumber: string | null | undefined,
  cropName: string | null | undefined,
  variety: string | null | undefined,
): CacheKey | null {
  const reg = (registrationNumber ?? '').trim();
  const crop = normalizeKey(cropName);
  if (!reg || !crop) {
    return null;
  }
  return {
    registrationNumber: reg,
    cropNameNorm: crop,
    varietyNorm: normalizeKey(variety),
  };
}

/**
 * Returns the cached match if present and not expired, otherwise null.
 * Never throws — DB errors are logged and treated as cache miss so the
 * caller falls back to the live LLM path.
 */
export async function lookupProductCropMatch(
  registrationNumber: string | null | undefined,
  cropName: string | null | undefined,
  variety: string | null | undefined,
): Promise<CachedMatchResult | null> {
  const key = buildKey(registrationNumber, cropName, variety);
  if (!key) {
    return null;
  }
  try {
    const row = await prisma.productCropMatchCache.findUnique({
      where: {
        registrationNumber_cropNameNorm_varietyNorm: {
          registrationNumber: key.registrationNumber,
          cropNameNorm: key.cropNameNorm,
          varietyNorm: key.varietyNorm,
        },
      },
    });
    if (!row) {
      return null;
    }
    const ageMs = Date.now() - row.updatedAt.getTime();
    if (ageMs > getTtlMs()) {
      return null;
    }
    return {
      isCompatible: row.isCompatible,
      confidence: row.confidence,
      reason: row.reason,
      matchedCrops: row.matchedCrops,
    };
  } catch (err) {
    console.warn(
      `[ProductCropMatchCache] lookup failed for reg=${key.registrationNumber} crop=${key.cropNameNorm}: ${(err as Error).message}`,
    );
    return null;
  }
}

/**
 * Upserts the match result. Never throws — DB errors are logged so a failed
 * cache write does not break the live matching call.
 */
export async function storeProductCropMatch(
  registrationNumber: string | null | undefined,
  cropName: string | null | undefined,
  variety: string | null | undefined,
  result: CachedMatchResult,
  model?: string | null,
): Promise<void> {
  const key = buildKey(registrationNumber, cropName, variety);
  if (!key) {
    return;
  }
  try {
    await prisma.productCropMatchCache.upsert({
      where: {
        registrationNumber_cropNameNorm_varietyNorm: {
          registrationNumber: key.registrationNumber,
          cropNameNorm: key.cropNameNorm,
          varietyNorm: key.varietyNorm,
        },
      },
      create: {
        registrationNumber: key.registrationNumber,
        cropNameNorm: key.cropNameNorm,
        varietyNorm: key.varietyNorm,
        isCompatible: result.isCompatible,
        confidence: Math.round(result.confidence),
        reason: result.reason,
        matchedCrops: [...result.matchedCrops],
        model: model ?? null,
      },
      update: {
        isCompatible: result.isCompatible,
        confidence: Math.round(result.confidence),
        reason: result.reason,
        matchedCrops: [...result.matchedCrops],
        model: model ?? null,
      },
    });
  } catch (err) {
    console.warn(
      `[ProductCropMatchCache] store failed for reg=${key.registrationNumber} crop=${key.cropNameNorm}: ${(err as Error).message}`,
    );
  }
}

export const __testing = { buildKey, getTtlMs };
