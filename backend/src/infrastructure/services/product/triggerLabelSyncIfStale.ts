import { ProductCategory } from '@prisma/client';
import { getProductLabelMatchingQueue } from '../../queue/ProductLabelMatchingQueue';
import { isStaleSummary } from '../../../application/use-cases/product/buildProductLabelSummary';

const COOLDOWN_MS = 60_000;
const MAX_PRODUCTS_PER_TRIGGER = 100;
const SUPPORTED_CATEGORIES: ReadonlySet<string> = new Set([
  ProductCategory.PESTICIDE,
  ProductCategory.FERTILIZER,
]);

const lastTriggerByUser = new Map<string, number>();

interface MaybeProduct {
  readonly id?: string | null;
  readonly category?: string | null;
  readonly labelMetadata?: unknown;
  readonly registrationNumber?: string | null;
}

/**
 * Fire-and-forget label-sync trigger for stale products in a listing response.
 * Skips if the same user has triggered within COOLDOWN_MS.
 * Picks up to MAX_PRODUCTS_PER_TRIGGER pesticides/fertilizers with stale labelMetadata.
 */
export function triggerLabelSyncIfStale(
  userId: string,
  products: ReadonlyArray<MaybeProduct>,
): void {
  const now = Date.now();
  const last = lastTriggerByUser.get(userId) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  const productIds = pickStaleProductIds(products);
  if (productIds.length === 0) return;
  lastTriggerByUser.set(userId, now);
  void enqueueSafely(productIds);
}

function pickStaleProductIds(products: ReadonlyArray<MaybeProduct>): string[] {
  const out: string[] = [];
  for (const p of products) {
    if (!p.id || typeof p.category !== 'string') continue;
    if (!SUPPORTED_CATEGORIES.has(p.category)) continue;
    if (!isStaleSummary(p.labelMetadata)) continue;
    if (p.category === ProductCategory.PESTICIDE && !p.registrationNumber) continue;
    out.push(p.id);
    if (out.length >= MAX_PRODUCTS_PER_TRIGGER) break;
  }
  return out;
}

async function enqueueSafely(productIds: string[]): Promise<void> {
  try {
    await getProductLabelMatchingQueue().addJob({ productIds });
  } catch (err) {
    console.error('[LABEL-SYNC-TRIGGER] Failed to enqueue:', err);
  }
}
