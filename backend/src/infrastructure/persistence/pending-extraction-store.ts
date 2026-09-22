import type { DocumentCategory } from '@prisma/client';
import { getRedisConnection } from '../queue/redis.connection';

const KEY_PREFIX = 'pending-extraction:';
const DEFAULT_TTL_SECONDS = Number(process.env.PENDING_EXTRACTION_TTL_SECONDS ?? 30 * 60);

export interface PendingExtractionRecord {
  readonly reviewId: string;
  readonly threadId: string;
  readonly userId: string;
  readonly companyId: string;
  readonly category: DocumentCategory;
  readonly fileName: string;
  readonly fileUrl?: string;
  readonly fileId?: string;
  readonly data: Record<string, unknown>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function buildKey(reviewId: string): string {
  return `${KEY_PREFIX}${reviewId}`;
}

export async function savePendingExtraction(record: PendingExtractionRecord): Promise<void> {
  const redis = getRedisConnection();
  await redis.set(buildKey(record.reviewId), JSON.stringify(record), 'EX', DEFAULT_TTL_SECONDS);
}

export async function getPendingExtraction(
  reviewId: string,
): Promise<PendingExtractionRecord | null> {
  const redis = getRedisConnection();
  const raw = await redis.get(buildKey(reviewId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingExtractionRecord;
  } catch {
    return null;
  }
}

export async function updatePendingExtractionData(
  reviewId: string,
  data: Record<string, unknown>,
): Promise<PendingExtractionRecord | null> {
  const existing = await getPendingExtraction(reviewId);
  if (!existing) return null;
  const updated: PendingExtractionRecord = {
    ...existing,
    data,
    updatedAt: Date.now(),
  };
  await savePendingExtraction(updated);
  return updated;
}

export async function deletePendingExtraction(reviewId: string): Promise<boolean> {
  const redis = getRedisConnection();
  const removed = await redis.del(buildKey(reviewId));
  return removed > 0;
}
