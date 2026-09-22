/**
 * LLM fallback for the FERTILIZER vs OTHER classification leg of the chat-extraction
 * mapper.
 *
 * Layered strategy (Step 4 of the chat-extraction hardening):
 *   1. InvoiceProductClassifier first — fast, deterministic, dataset-driven for
 *      PHYTOSANITARY and regex-based for FERTILIZER vs OTHER.
 *   2. This fallback re-checks every entry left as `OTHER` (and without a
 *      registrationNumber, so we don't touch confirmed PHYTOSANITARY entries):
 *      it batches the unknown product names into a single LLM call and only
 *      upgrades `OTHER` → `FERTILIZER` when the model says so. PHYTOSANITARY
 *      suggestions from the LLM are ignored — the official dataset remains the
 *      sole authority for that category.
 *
 * Cache:
 *   - Per-process Map keyed by normalized product name (UPPERCASE-trim).
 *   - Survives across requests within the same node, avoiding duplicate LLM
 *     calls for repeated names (e.g. recurring fertilizer SKUs).
 *
 * TODO(future):
 *   - Integrate the official "Registro Concimi" dataset and prefer it over the
 *     keyword regex + LLM fallback (deterministic, no runtime cost).
 *   - Move the cache to Redis with a TTL so it spans multiple node instances
 *     and survives restarts.
 */
import type { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import { LlmProductCategoryClassifier } from '../../../infrastructure/services/tool/llm-product-category-classifier';

export interface FertilizerFallbackClassifier {
  classifyProductNames(params: {
    productNames: ReadonlyArray<string>;
  }): Promise<ReadonlyMap<string, 'PHYTOSANITARY' | 'FERTILIZER' | 'OTHER'>>;
}

const cache = new Map<string, 'FERTILIZER' | 'OTHER'>();

function normalize(name: string): string {
  return name.trim().toUpperCase();
}

function isCandidateForLlmFallback(entry: InvoiceEntry): boolean {
  return (
    entry.productCategory === 'OTHER' &&
    !entry.registrationNumber &&
    typeof entry.productName === 'string' &&
    entry.productName.trim().length > 0
  );
}

/**
 * Re-runs the FERTILIZER vs OTHER decision via LLM for every entry the regex
 * classifier left as `OTHER`. Entries already classified as `PHYTOSANITARY`
 * (which means the official dataset matched them) are left untouched. The
 * function is best-effort: any LLM failure returns the input unchanged.
 */
export async function applyLlmFertilizerFallback(
  entries: ReadonlyArray<InvoiceEntry>,
  llm: FertilizerFallbackClassifier = new LlmProductCategoryClassifier(),
): Promise<ReadonlyArray<InvoiceEntry>> {
  const candidates = entries.filter(isCandidateForLlmFallback);
  if (candidates.length === 0) return entries;

  // Resolve from cache first; only ask the LLM for genuinely unknown names.
  const namesToAsk: string[] = [];
  const cachedDecisions = new Map<string, 'FERTILIZER' | 'OTHER'>();
  for (const entry of candidates) {
    const key = normalize(entry.productName);
    const cached = cache.get(key);
    if (cached) {
      cachedDecisions.set(key, cached);
    } else if (!namesToAsk.includes(key)) {
      namesToAsk.push(key);
    }
  }

  let llmDecisions: ReadonlyMap<string, 'FERTILIZER' | 'OTHER'> = new Map();
  if (namesToAsk.length > 0) {
    try {
      const raw = await llm.classifyProductNames({ productNames: namesToAsk });
      const collected = new Map<string, 'FERTILIZER' | 'OTHER'>();
      for (const [name, category] of raw) {
        // Only upgrade OTHER → FERTILIZER. PHYTOSANITARY suggestions from the
        // LLM are ignored — the official dataset is the sole authority.
        const normalized = category === 'FERTILIZER' ? 'FERTILIZER' : 'OTHER';
        collected.set(name, normalized);
        cache.set(name, normalized);
      }
      llmDecisions = collected;
    } catch (err) {
      console.warn('[llm-fallback-invoice-category] LLM call failed:', err);
    }
  }

  return entries.map((entry) => {
    if (!isCandidateForLlmFallback(entry)) return entry;
    const key = normalize(entry.productName);
    const decision = cachedDecisions.get(key) ?? llmDecisions.get(key);
    if (decision === 'FERTILIZER') {
      return { ...entry, productCategory: 'FERTILIZER' };
    }
    return entry;
  });
}

/**
 * Test-only utility — clears the in-process cache so each test starts clean.
 * Do NOT call from production code.
 */
export function __resetFertilizerFallbackCacheForTests(): void {
  cache.clear();
}
