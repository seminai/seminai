import { getRedisConnection } from '../../queue/redis.connection';
import {
  type PreclassificationResult,
  type StoredPreclassificationItem,
} from '../../../domain/dtos/preclassification.dto';

interface PreclassificationIndex {
  readonly userId: string;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly fileName: string }>;
}

const PROMPT_VERSION = 'v2';
const RESULT_TTL_S = Number(process.env.PRECLASSIFY_RESULT_TTL_S ?? 1800);
const CACHE_TTL_S = Number(process.env.PRECLASSIFY_CACHE_TTL_S ?? 21600);

function indexKey(preclassId: string): string {
  return `preclassify:index:${preclassId}`;
}

function resultKey(preclassId: string, itemId: string): string {
  return `preclassify:result:${preclassId}:${itemId}`;
}

function cacheKey(fileHash: string, companySetHash: string): string {
  return `preclassify:cache:${PROMPT_VERSION}:${fileHash}:${companySetHash}`;
}

function pendingItem(itemId: string, fileName: string): StoredPreclassificationItem {
  return {
    itemId,
    fileName,
    status: 'pending',
    documentCategory: null,
    categoryConfidence: 0,
    companyId: null,
    companyConfidence: 0,
    companyMatchSource: 'none',
    error: null,
  };
}

/** Seeds the index and a `pending` result for each item of a new request. */
export async function seedPreclassification({
  preclassId,
  userId,
  items,
}: {
  readonly preclassId: string;
  readonly userId: string;
  readonly items: ReadonlyArray<{ readonly itemId: string; readonly fileName: string }>;
}): Promise<void> {
  const redis = getRedisConnection();
  const index: PreclassificationIndex = { userId, items };
  await redis.set(indexKey(preclassId), JSON.stringify(index), 'EX', RESULT_TTL_S);
  await Promise.all(
    items.map((item) =>
      redis.set(
        resultKey(preclassId, item.itemId),
        JSON.stringify(pendingItem(item.itemId, item.fileName)),
        'EX',
        RESULT_TTL_S,
      ),
    ),
  );
}

/** Persists a classified result for one item. */
export async function setItemResult({
  preclassId,
  itemId,
  fileName,
  result,
}: {
  readonly preclassId: string;
  readonly itemId: string;
  readonly fileName: string;
  readonly result: PreclassificationResult;
}): Promise<void> {
  const stored: StoredPreclassificationItem = {
    itemId,
    fileName,
    status: 'classified',
    documentCategory: result.documentCategory,
    categoryConfidence: result.categoryConfidence,
    companyId: result.companyId,
    companyConfidence: result.companyConfidence,
    companyMatchSource: result.companyMatchSource,
    error: null,
  };
  await getRedisConnection().set(
    resultKey(preclassId, itemId),
    JSON.stringify(stored),
    'EX',
    RESULT_TTL_S,
  );
}

/** Persists an error result for one item. */
export async function setItemError({
  preclassId,
  itemId,
  fileName,
  error,
}: {
  readonly preclassId: string;
  readonly itemId: string;
  readonly fileName: string;
  readonly error: string;
}): Promise<void> {
  const stored: StoredPreclassificationItem = {
    ...pendingItem(itemId, fileName),
    status: 'error',
    error: error.slice(0, 300),
  };
  await getRedisConnection().set(
    resultKey(preclassId, itemId),
    JSON.stringify(stored),
    'EX',
    RESULT_TTL_S,
  );
}

/** Returns the full status (owner + items in index order) or null if unknown/expired. */
export async function getPreclassificationStatus(
  preclassId: string,
): Promise<{ readonly userId: string; readonly items: StoredPreclassificationItem[] } | null> {
  const redis = getRedisConnection();
  const rawIndex = await redis.get(indexKey(preclassId));
  if (!rawIndex) return null;
  const index = JSON.parse(rawIndex) as PreclassificationIndex;
  if (index.items.length === 0) return { userId: index.userId, items: [] };
  const keys = index.items.map((item) => resultKey(preclassId, item.itemId));
  const rawResults = await redis.mget(...keys);
  const items = index.items.map((item, i) => {
    const raw = rawResults[i];
    return raw
      ? (JSON.parse(raw) as StoredPreclassificationItem)
      : pendingItem(item.itemId, item.fileName);
  });
  return { userId: index.userId, items };
}

/** Returns the userId that owns a preclassId (for socket/REST authz), or null. */
export async function getPreclassificationOwner(preclassId: string): Promise<string | null> {
  const rawIndex = await getRedisConnection().get(indexKey(preclassId));
  if (!rawIndex) return null;
  return (JSON.parse(rawIndex) as PreclassificationIndex).userId;
}

/** Cross-flow cache lookup keyed by file content hash + company set. */
export async function getCachedResult({
  fileHash,
  companySetHash,
}: {
  readonly fileHash: string;
  readonly companySetHash: string;
}): Promise<PreclassificationResult | null> {
  const raw = await getRedisConnection().get(cacheKey(fileHash, companySetHash));
  return raw ? (JSON.parse(raw) as PreclassificationResult) : null;
}

/** Stores a result in the cross-flow cache so repeated files skip the LLM. */
export async function setCachedResult({
  fileHash,
  companySetHash,
  result,
}: {
  readonly fileHash: string;
  readonly companySetHash: string;
  readonly result: PreclassificationResult;
}): Promise<void> {
  await getRedisConnection().set(
    cacheKey(fileHash, companySetHash),
    JSON.stringify(result),
    'EX',
    CACHE_TTL_S,
  );
}
