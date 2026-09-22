import { prisma } from '../../../repositories/Prisma';
import type { MentionItem, MentionEntityType } from '../../../../domain/dtos/mention.dto';
import { resolveMentionAccessReason } from './mention-access-reason-resolver';

interface ResolveMentionContextParams {
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

const TOOL_HINTS: Record<MentionEntityType, readonly string[]> = {
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
interface CacheEntry {
  readonly promise: Promise<{ block: string | null; reason?: MentionResolutionReason }>;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 200;
const resolverCache = new Map<string, CacheEntry>();

function cacheKey(userId: string, mention: MentionItem): string {
  return `${userId}::${mention.type}::${mention.id}`;
}

function pruneExpired(now: number): void {
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

function getCachedOrResolve(
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

async function resolveEntityContext(params: {
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

async function resolveCompany(
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

async function resolveProduct(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.product.findFirst({
    where: { id, warehouse: { company: { companyUsers: { some: { userId } } } } },
    select: {
      name: true,
      category: true,
      registrationNumber: true,
      warehouse: { select: { company: { select: { name: true } } } },
      stocks: {
        select: { quantity: true, unitOfMeasureQuantity: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });
  if (!row)
    return {
      block: null,
      reason: await resolveMentionAccessReason({ type: 'product', id, userId }),
    };
  const totalStock = row.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const unit = row.stocks[0]?.unitOfMeasureQuantity ?? 'N/A';
  return {
    block: `**Prodotto: ${row.name}**\nCategoria: ${row.category} | Reg: ${row.registrationNumber ?? 'N/A'} | Azienda: ${row.warehouse.company.name} | Giacenza: ${totalStock} ${unit}`,
  };
}

async function resolveField(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.field.findFirst({
    where: { id, company: { companyUsers: { some: { userId } } } },
    select: {
      name: true,
      sauHa: true,
      city: true,
      foglio: true,
      particella: true,
      company: { select: { name: true } },
      productionUnitsOnFields: {
        select: {
          productionUnit: {
            select: {
              cycles: { select: { cropName: true }, take: 1, orderBy: { seasonYear: 'desc' } },
            },
          },
        },
        take: 3,
      },
    },
  });
  if (!row)
    return { block: null, reason: await resolveMentionAccessReason({ type: 'field', id, userId }) };
  const crops = row.productionUnitsOnFields
    .map((puf) => puf.productionUnit.cycles[0]?.cropName)
    .filter(Boolean)
    .join(', ');
  const catasto = [row.foglio, row.particella].filter(Boolean).join('/');
  return {
    block: `**Campo: ${row.name}**\nAzienda: ${row.company?.name ?? 'N/A'} | SAU: ${row.sauHa ?? 'N/A'} ha | Comune: ${row.city ?? 'N/A'} | Catasto: ${catasto || 'N/A'} | Colture: ${crops || 'N/A'}`,
  };
}

async function resolveProductionUnit(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.productionUnit.findFirst({
    where: {
      id,
      productionUnitsOnFields: {
        some: { field: { company: { companyUsers: { some: { userId } } } } },
      },
    },
    select: {
      name: true,
      areaHa: true,
      cycles: {
        select: { cropName: true, variety: true },
        take: 1,
        orderBy: { seasonYear: 'desc' },
      },
      productionUnitsOnFields: {
        select: { field: { select: { name: true, company: { select: { name: true } } } } },
        take: 1,
      },
    },
  });
  if (!row)
    return {
      block: null,
      reason: await resolveMentionAccessReason({ type: 'production_unit', id, userId }),
    };
  const cycle = row.cycles[0];
  const fieldInfo = row.productionUnitsOnFields[0]?.field;
  return {
    block: `**Unita' Produttiva: ${row.name}**\nColtura: ${cycle?.cropName ?? 'N/A'} (${cycle?.variety ?? 'N/A'}) | Area: ${row.areaHa} ha | Campo: ${fieldInfo?.name ?? 'N/A'} | Azienda: ${fieldInfo?.company?.name ?? 'N/A'}`,
  };
}

async function resolveStock(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.stock.findFirst({
    where: { id, product: { warehouse: { company: { companyUsers: { some: { userId } } } } } },
    select: {
      quantity: true,
      unitOfMeasureQuantity: true,
      price: true,
      unitOfMeasurePrice: true,
      companySupplierName: true,
      product: {
        select: { name: true, warehouse: { select: { company: { select: { name: true } } } } },
      },
    },
  });
  if (!row)
    return { block: null, reason: await resolveMentionAccessReason({ type: 'stock', id, userId }) };
  return {
    block: `**Stock: ${row.product.name}**\nQuantita': ${row.quantity} ${row.unitOfMeasureQuantity} | Prezzo: ${row.price} €/${row.unitOfMeasurePrice} | Fornitore: ${row.companySupplierName ?? 'N/A'} | Azienda: ${row.product.warehouse.company.name}`,
  };
}

async function resolveFile(
  id: string,
  userId: string,
): Promise<{ block: string | null; reason?: MentionResolutionReason }> {
  const row = await prisma.file.findFirst({
    where: { id, company: { companyUsers: { some: { userId } } } },
    select: {
      name: true,
      url: true,
      type: true,
      metadata: true,
      company: { select: { name: true } },
      extractions: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          category: true,
          status: true,
          updatedAt: true,
          extractedData: true,
        },
      },
    },
  });
  if (!row)
    return { block: null, reason: await resolveMentionAccessReason({ type: 'file', id, userId }) };
  let result = `**Documento: ${row.name}**\nTipo: ${row.type ?? 'N/A'} | Azienda: ${row.company.name}\nURL: ${row.url}`;
  const metadataSummary = summarizeJson(row.metadata);
  if (metadataSummary) {
    result += `\nMetadati file: ${metadataSummary}`;
  }
  const latestExtraction = row.extractions[0];
  if (latestExtraction?.extractedData) {
    const extractionSummary = summarizeExtractionData(latestExtraction.extractedData);
    result += `\nUltima estrazione salvata (${latestExtraction.category}, ${latestExtraction.status}, ${latestExtraction.updatedAt.toISOString()}):\n${extractionSummary}`;
  } else {
    result +=
      '\nNessun dato estratto salvato per questo documento. Rispondi usando i metadati disponibili senza richiedere upload.';
  }
  return { block: result };
}

function summarizeExtractionData(extractedData: unknown): string {
  const asRecord =
    extractedData && typeof extractedData === 'object'
      ? (extractedData as Record<string, unknown>)
      : null;
  const entries = Array.isArray(asRecord?.entries)
    ? (asRecord.entries as Array<Record<string, unknown>>)
    : [];
  if (entries.length > 0) {
    const firstEntry = entries[0];
    const supplierName =
      typeof firstEntry.supplierName === 'string' ? firstEntry.supplierName : 'N/A';
    const supplierVat = typeof firstEntry.supplierVat === 'string' ? firstEntry.supplierVat : 'N/A';
    const invoiceNumber =
      typeof firstEntry.invoiceNumber === 'string' ? firstEntry.invoiceNumber : 'N/A';
    const invoiceDate = typeof firstEntry.invoiceDate === 'string' ? firstEntry.invoiceDate : 'N/A';
    const productName = typeof firstEntry.productName === 'string' ? firstEntry.productName : 'N/A';
    return `Fornitore: ${supplierName} (${supplierVat}) | Documento: ${invoiceNumber} | Data: ${invoiceDate} | Prodotto: ${productName}`;
  }
  return summarizeJson(extractedData) ?? 'N/A';
}

function summarizeJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    const raw = JSON.stringify(value);
    if (!raw) return null;
    return raw.length > 800 ? `${raw.slice(0, 800)}...` : raw;
  } catch {
    return null;
  }
}
