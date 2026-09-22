/**
 * Process-wide caches for the RAG vector stores used by the Dosage ReAct
 * agent. Vector store construction is expensive (DB fetch + OpenAI embeddings
 * for hundreds of operations, or PDF download + parse + embed for disciplinari)
 * and the underlying data is rarely invalidated within an agent session, so we
 * decouple the store lifecycle from the per-thread `agentAppCache` (30 min TTL).
 *
 * - `jobOperationsVectorStoreCache` is keyed by `jobId` and self-invalidates
 *   when the operations fingerprint changes (id + updatedAt of every operation).
 * - `disciplinariPdfVectorStoreCache` is keyed by a hash of the BDF catalog
 *   passed in, so re-using the same catalog reuses the same store.
 *
 * Both caches expose `invalidate(key)` for explicit eviction.
 */

import { createHash } from 'crypto';
import type { JobWithAssignmentWithoutHistoryDTO } from '../../../../../domain/dtos/job-assignment.dto';
import {
  JobOperationsVectorStore,
  createJobOperationsVectorStore,
  DisciplinariPdfVectorStore,
  type DisciplinareEntry,
} from '../../chat_dosage_agent/rag';

const JOB_OPERATIONS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const JOB_OPERATIONS_MAX_ENTRIES = 100;

const DISCIPLINARI_PDF_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DISCIPLINARI_PDF_MAX_ENTRIES = 50;

interface CacheEntry<V> {
  readonly value: V;
  readonly fingerprint: string;
  expiresAt: number;
  lastAccessedAt: number;
}

/**
 * In-memory TTL + LRU cache. Eviction policy: drop expired entries first; when
 * still over capacity, drop the least-recently-accessed. Single-process; not
 * suited for multi-instance deployments without a shared backend.
 */
export class VectorStoreCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  public get(key: string, fingerprint: string): V | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now() || entry.fingerprint !== fingerprint) {
      this.entries.delete(key);
      return null;
    }
    entry.lastAccessedAt = Date.now();
    return entry.value;
  }

  public set(key: string, fingerprint: string, value: V): void {
    const now = Date.now();
    this.entries.set(key, {
      value,
      fingerprint,
      expiresAt: now + this.ttlMs,
      lastAccessedAt: now,
    });
    this.evictIfOverCapacity();
  }

  public invalidate(key: string): void {
    this.entries.delete(key);
  }

  public size(): number {
    return this.entries.size;
  }

  private evictIfOverCapacity(): void {
    if (this.entries.size <= this.maxEntries) return;
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < now) this.entries.delete(key);
    }
    if (this.entries.size <= this.maxEntries) return;
    const sorted = [...this.entries.entries()].sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
    );
    while (this.entries.size > this.maxEntries) {
      const oldest = sorted.shift();
      if (!oldest) break;
      this.entries.delete(oldest[0]);
    }
  }
}

// ── Singletons ──

export const jobOperationsVectorStoreCache = new VectorStoreCache<JobOperationsVectorStore>(
  JOB_OPERATIONS_TTL_MS,
  JOB_OPERATIONS_MAX_ENTRIES,
);

export const disciplinariPdfVectorStoreCache = new VectorStoreCache<DisciplinariPdfVectorStore>(
  DISCIPLINARI_PDF_TTL_MS,
  DISCIPLINARI_PDF_MAX_ENTRIES,
);

// ── Fingerprints ──

/**
 * Stable fingerprint over the operations identity + version stamp. If any
 * operation is added, removed, or updated, the digest changes and the next
 * `get` returns a cache miss — forcing a fresh fetch + embed.
 */
export function fingerprintOperations(
  operations: ReadonlyArray<JobWithAssignmentWithoutHistoryDTO>,
): string {
  const parts = operations
    .map((op) => `${op.job.id}:${op.job.updatedAt.getTime()}`)
    .sort()
    .join('|');
  return createHash('sha1').update(parts).digest('hex').slice(0, 16);
}

/** Stable fingerprint over the disciplinari catalog (titles + URLs + years). */
export function fingerprintCatalog(catalog: ReadonlyArray<DisciplinareEntry>): string {
  const parts = catalog
    .map((e) => `${e.title}|${e.anno}|${e.url}`)
    .sort()
    .join('||');
  return createHash('sha1').update(parts).digest('hex').slice(0, 16);
}

// ── Helpers (factory + cache lookup in one call) ──

export interface JobOperationsVectorStoreFactoryInput {
  readonly jobId: string;
  readonly operations: ReadonlyArray<JobWithAssignmentWithoutHistoryDTO>;
}

/**
 * Returns a cached JobOperationsVectorStore if the operations fingerprint
 * matches; otherwise builds (and re-embeds) a fresh one and caches it.
 */
export async function getOrCreateJobOperationsVectorStore(
  input: JobOperationsVectorStoreFactoryInput,
): Promise<JobOperationsVectorStore> {
  const fingerprint = fingerprintOperations(input.operations);
  const cached = jobOperationsVectorStoreCache.get(input.jobId, fingerprint);
  if (cached) return cached;
  const store = await createJobOperationsVectorStore([...input.operations], input.jobId);
  jobOperationsVectorStoreCache.set(input.jobId, fingerprint, store);
  return store;
}

/**
 * Returns a cached DisciplinariPdfVectorStore for the given catalog if present,
 * otherwise constructs an empty (lazy-fetch) store and caches it. The store
 * itself fetches and indexes PDFs on first `search()` and retains them for the
 * lifetime of the cache entry, so subsequent requests reuse fetched+embedded PDFs.
 */
export function getOrCreateDisciplinariPdfVectorStore(
  catalog: ReadonlyArray<DisciplinareEntry>,
): DisciplinariPdfVectorStore {
  const fingerprint = fingerprintCatalog(catalog);
  const cacheKey = fingerprint;
  const cached = disciplinariPdfVectorStoreCache.get(cacheKey, fingerprint);
  if (cached) return cached;
  const store = new DisciplinariPdfVectorStore([...catalog]);
  disciplinariPdfVectorStoreCache.set(cacheKey, fingerprint, store);
  return store;
}
