import type { MentionItem, MentionEntityType } from '../../../../domain/dtos/mention.dto';
import { prisma } from '../../../repositories/Prisma';
import { resolveMentionAccessReason } from './mention-access-reason-resolver';
import { resolveField, resolveFile, resolveProduct, resolveProductionUnit, resolveStock } from './mention-context-resolver.part-02-resolve-product';

export interface ResolveMentionContextParams {
  readonly mentions: readonly MentionItem[];
  readonly userId: string;
  readonly hasUploadedFilesInWorkingMemory?: boolean;
}

export type MentionResolutionReason = 'not_found' | 'not_authorized' | 'extraction_failed';

export interface UnresolvedMention {
  readonly type: MentionEntityType;
  readonly id: string;
  readonly label: string;
  readonly reason: MentionResolutionReason;
}

export interface ResolveMentionContextResult {
  readonly context: string;
  readonly unresolved: readonly UnresolvedMention[];
}

export const TOOL_HINTS: Record<MentionEntityType, readonly string[]> = {
  company: ['list_user_companies', 'list_production_units', 'list_company_products'],
  product: [
    'search_products',
    'search_product_label_database',
    'check_product_crop_authorizations',
  ],
  field: ['list_user_fields', 'extract_buffer_zones'],
  production_unit: ['list_production_units', 'search_products'],
  stock: ['search_company_stock'],
  file: [],
};

// ── LRU + TTL cache for resolved mentions (PR-H) ──
// The same (userId, type, id) tuple often comes up multiple times within a
// short window (rich @-mention payloads, builder retries, future graph nodes
// that re-resolve on the same turn). Caching the Promise for ~30s collapses
// all of them onto a single Prisma round-trip without leaking across users.
export interface CacheEntry {
  readonly promise: Promise<{ block: string | null; reason?: MentionResolutionReason }>;
  expiresAt: number;
}

export const CACHE_TTL_MS = 30_000;

export const CACHE_MAX_ENTRIES = 200;

export const resolverCache = new Map<string, CacheEntry>();

export function cacheKey(userId: string, mention: MentionItem): string {
  return `${userId}::${mention.type}::${mention.id}`;
}

export function pruneExpired(now: number): void {
  for (const [key, entry] of resolverCache) {
    if (entry.expiresAt <= now) resolverCache.delete(key);
  }
  if (resolverCache.size > CACHE_MAX_ENTRIES) {
    const overflow = resolverCache.size - CACHE_MAX_ENTRIES;
    const oldest = [...resolverCache.entries()]
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, overflow);
    for (const [key] of oldest) resolverCache.delete(key);
  }
}

export function getCachedOrResolve(
  userId: string,
  mention: MentionItem,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const now = Date.now();
  const key = cacheKey(userId, mention);
  const existing = resolverCache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }
  const promise = resolveEntityContext({ mention, userId });
  resolverCache.set(key, { promise, expiresAt: now + CACHE_TTL_MS });
  pruneExpired(now);
  return promise;
}

/** Test-only helper to clear the cache between cases. */
export function _resetMentionResolverCacheForTesting(): void {
  resolverCache.clear();
}

export async function resolveMentionContext(
  params: ResolveMentionContextParams,
): Promise<ResolveMentionContextResult> {
  const { mentions, userId, hasUploadedFilesInWorkingMemory = false } = params;
  if (mentions.length === 0) return { context: '', unresolved: [] };
  const blocks: string[] = [];
  const unresolved: UnresolvedMention[] = [];
  const hintedTools = new Set<string>();

  // Dedup by (type, id) preserving first-seen order. The deduped list is
  // what we resolve AND what we emit, so a duplicate mention in the payload
  // produces a single Prisma round-trip and a single block in the output.
  const uniqueMentions: MentionItem[] = [];
  const seen = new Set<string>();
  for (const m of mentions) {
    const k = `${m.type}::${m.id}`;
    if (!seen.has(k)) {
      seen.add(k);
      uniqueMentions.push(m);
    }
  }

  // Run all lookups in parallel. The internal LRU+TTL cache collapses
  // repeated tuples across calls within CACHE_TTL_MS.
  const resolvedList = await Promise.all(uniqueMentions.map((m) => getCachedOrResolve(userId, m)));

  for (let i = 0; i < uniqueMentions.length; i += 1) {
    const mention = uniqueMentions[i];
    const resolved = resolvedList[i];
    if (resolved.reason) {
      unresolved.push({
        type: mention.type,
        id: mention.id,
        label: mention.label,
        reason: resolved.reason,
      });
      continue;
    }
    if (resolved.block) {
      blocks.push(resolved.block);
      for (const tool of TOOL_HINTS[mention.type] ?? []) {
        hintedTools.add(tool);
      }
    }
  }

  if (hasUploadedFilesInWorkingMemory && mentions.some((mention) => mention.type === 'file')) {
    hintedTools.add('extract_from_file');
  }
  if (blocks.length === 0) return { context: '', unresolved };

  const header = `[SYSTEM: Contesto entita' menzionate dall'utente (@mention)]`;
  const body = blocks.join('\n\n');
  const hint =
    hintedTools.size > 0
      ? `\n[SYSTEM: Per approfondire, usa prioritariamente: ${[...hintedTools].join(', ')}]`
      : '';
  return { context: `${header}\n${body}${hint}`, unresolved };
}

export async function resolveEntityContext(params: {
  mention: MentionItem;
  userId: string;
}): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const { mention, userId } = params;
  if (mention.type === 'company') return resolveCompany(mention.id, userId);
  if (mention.type === 'product') return resolveProduct(mention.id, userId);
  if (mention.type === 'field') return resolveField(mention.id, userId);
  if (mention.type === 'production_unit') return resolveProductionUnit(mention.id, userId);
  if (mention.type === 'stock') return resolveStock(mention.id, userId);
  return resolveFile(mention.id, userId);
}

export async function resolveCompany(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.company.findFirst({
    where: { id, companyUsers: { some: { userId } } },
    select: {
      name: true,
      vatNumber: true,
      city: true,
      _count: { select: { fields: true, warehouses: true } },
    },
  });
  if (!row)
    return {
      block: null,
      reason: await resolveMentionAccessReason({ type: 'company', id, userId }),
    };
  return {
    block: `**Azienda: ${row.name}**\nP.IVA: ${row.vatNumber} | Citta': ${row.city ?? 'N/A'} | Campi: ${row._count.fields} | Magazzini: ${row._count.warehouses}`,
  };
}
