import { WorkingMemory } from './type/state';
import type { IWorkingMemoryRepository } from '../../../../domain/repositories/IWorkingMemoryRepository';
import { retryWithBackoff } from './tools/retry-wrapper';
import { createChatEmitter } from './socket/chat-socket-emitter';

/**
 * Working memory entry with TTL tracking.
 */
export interface WorkingMemoryEntry {
  data: WorkingMemory;
  lastAccessedAt: number;
  /** Whether this entry has unsaved changes pending DB write. */
  dirty: boolean;
}

/**
 * Configuration for the working memory store.
 */
export const WM_TTL_MS = 30 * 60 * 1000;

// 30 minutes
export const WM_MAX_ENTRIES_DEFAULT = 500;

/**
 * Reads the cap from `DOSAGE_WM_MAX_ENTRIES`, falling back to the default
 * when missing / NaN / non-positive. Clamped to >= 1 so the LRU sweep is
 * always well-defined.
 */
export function parseMaxEntries(): number {
  const raw = process.env.DOSAGE_WM_MAX_ENTRIES;
  if (!raw) return WM_MAX_ENTRIES_DEFAULT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : WM_MAX_ENTRIES_DEFAULT;
}

export const WM_MAX_ENTRIES = parseMaxEntries();

export const WM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// cleanup every 5 minutes
export const WM_DEBOUNCE_MS = 2_000;

// debounce DB writes by 2 seconds

/**
 * Keys that cannot be serialized (Buffers, class instances, etc.).
 * These are excluded from DB persistence but kept in the in-memory cache.
 */
export const NON_SERIALIZABLE_KEYS = new Set<keyof WorkingMemory>(['uploadedFileBuffer', 'uploadedFiles']);

/**
 * Singleton store for working memory across tool calls.
 * Keyed by threadId so each conversation has its own workspace.
 *
 * Includes TTL-based eviction, write-through to DB (debounced),
 * and DB hydration fallback on cache miss.
 */
export const store = new Map<string, WorkingMemoryEntry>();

export const runtime = {
  cleanupTimer: null as ReturnType<typeof setInterval> | null,
  repository: null as IWorkingMemoryRepository | null,
};

/** Pending debounce timers for DB writes, keyed by threadId. */
export const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Sets the DB runtime.repository for working memory persistence.
 * Call during server startup after Prisma is ready.
 */
export function setWorkingMemoryRepository(repo: IWorkingMemoryRepository): void {
  runtime.repository = repo;
}

/**
 * Extracts the serializable subset of WorkingMemory (excludes Buffers etc.).
 */
export function toSerializable(mem: WorkingMemory): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mem)) {
    if (NON_SERIALIZABLE_KEYS.has(key as keyof WorkingMemory)) continue;
    if (value === undefined) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Schedules a debounced DB write for a threadId.
 */
export function schedulePersist(threadId: string): void {
  if (!runtime.repository) return;
  const existing = pendingWrites.get(threadId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    pendingWrites.delete(threadId);
    const entry = store.get(threadId);
    if (!entry || !entry.dirty) return;
    try {
      await runtime.repository!.save(threadId, toSerializable(entry.data));
      entry.dirty = false;
    } catch (error) {
      console.error(`[working-memory] Failed to persist thread ${threadId}:`, error);
    }
  }, WM_DEBOUNCE_MS);
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
  pendingWrites.set(threadId, timer);
}

/**
 * Evicts expired entries and trims to max size.
 * Flushes dirty entries to DB before eviction.
 */
export function evictStaleEntries(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [threadId, entry] of store) {
    if (now - entry.lastAccessedAt > WM_TTL_MS) {
      toDelete.push(threadId);
    }
  }

  for (const threadId of toDelete) {
    const entry = store.get(threadId);
    console.warn('[working-memory] eviction', {
      threadId,
      lastAccessedAt: entry?.lastAccessedAt,
      sizeBefore: store.size,
      reason: 'ttl',
    });
    flushToDisk(threadId);
    store.delete(threadId);
  }

  // If still over max, evict oldest entries
  if (store.size > WM_MAX_ENTRIES) {
    const sorted = [...store.entries()].sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
    const toRemove = sorted.slice(0, store.size - WM_MAX_ENTRIES);
    for (const [threadId, entry] of toRemove) {
      console.warn('[working-memory] eviction', {
        threadId,
        lastAccessedAt: entry.lastAccessedAt,
        sizeBefore: store.size,
        reason: 'lru-overflow',
      });
      flushToDisk(threadId);
      store.delete(threadId);
    }
  }
}

/**
 * Immediately flushes dirty working memory to DB (synchronous schedule).
 */
export function flushToDisk(threadId: string): void {
  if (!runtime.repository) return;
  const entry = store.get(threadId);
  if (!entry || !entry.dirty) return;
  // Cancel pending debounce
  const pending = pendingWrites.get(threadId);
  if (pending) {
    clearTimeout(pending);
    pendingWrites.delete(threadId);
  }
  // Fire-and-forget async write with retry on transient errors (PR-J).
  // Worst case: ~700ms (100 + 200 + 400ms backoff) before giving up.
  retryWithBackoff(() => runtime.repository!.save(threadId, toSerializable(entry.data)), {
    attempts: 3,
    baseMs: 100,
    onAttemptFailure: (attempt, err, nextDelayMs) =>
      console.warn(
        `[working-memory] Flush attempt ${attempt}/3 failed for ${threadId} (retry in ${nextDelayMs}ms):`,
        err instanceof Error ? err.message : err,
      ),
  })
    .then(() => {
      entry.dirty = false;
    })
    .catch((err) => {
      console.error(
        `[working-memory] Flush failed after 3 attempts for ${threadId}:`,
        err instanceof Error ? err.message : err,
      );
    });
}

export function ensureCleanupTimer(): void {
  if (runtime.cleanupTimer) return;
  runtime.cleanupTimer = setInterval(evictStaleEntries, WM_CLEANUP_INTERVAL_MS);
  // Allow the process to exit even if the timer is still running
  if (runtime.cleanupTimer && typeof runtime.cleanupTimer === 'object' && 'unref' in runtime.cleanupTimer) {
    runtime.cleanupTimer.unref();
  }
}

/**
 * Get or create working memory for a thread.
 * Checks in-memory cache first, then falls back to DB hydration.
 */
export function getWorkingMemory(threadId: string): WorkingMemory {
  ensureCleanupTimer();

  let entry = store.get(threadId);
  if (!entry) {
    entry = { data: {}, lastAccessedAt: Date.now(), dirty: false };
    store.set(threadId, entry);
  } else {
    entry.lastAccessedAt = Date.now();
  }
  return entry.data;
}

/**
 * Hydrates working memory from DB if the in-memory cache is empty.
 * Should be called once on agent creation, before tool execution begins.
 */
export async function hydrateWorkingMemory(threadId: string): Promise<WorkingMemory> {
  ensureCleanupTimer();

  const existing = store.get(threadId);
  if (existing && Object.keys(existing.data).length > 0) {
    existing.lastAccessedAt = Date.now();
    return existing.data;
  }

  if (runtime.repository) {
    try {
      const persisted = await runtime.repository.load(threadId);
      if (persisted && Object.keys(persisted).length > 0) {
        const entry: WorkingMemoryEntry = {
          data: persisted as WorkingMemory,
          lastAccessedAt: Date.now(),
          dirty: false,
        };
        store.set(threadId, entry);
        return entry.data;
      }
    } catch (error) {
      console.warn(`[working-memory] DB hydration failed for ${threadId}:`, error);
    }
  }

  const entry: WorkingMemoryEntry = { data: {}, lastAccessedAt: Date.now(), dirty: false };
  store.set(threadId, entry);
  return entry.data;
}

/**
 * Update working memory for a thread (shallow merge).
 * Emits Socket.IO events for each updated key if a chat emitter is available.
 * Schedules a debounced DB write.
 */
export function updateWorkingMemory(threadId: string, update: Partial<WorkingMemory>): void {
  const mem = getWorkingMemory(threadId);
  Object.assign(mem, update);

  // Mark dirty for DB persistence
  const entry = store.get(threadId);
  if (entry) {
    entry.dirty = true;
    schedulePersist(threadId);
  }

  const emitter = createChatEmitter(threadId);
  if (emitter) {
    for (const key of Object.keys(update)) {
      const value = update[key as keyof WorkingMemory];
      const preview = value !== undefined ? JSON.stringify(value).slice(0, 200) : '';
      emitter.emitMemoryUpdate(key, preview);
    }
  }
}
