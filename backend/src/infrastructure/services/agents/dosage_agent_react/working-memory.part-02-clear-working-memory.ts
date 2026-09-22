import { WorkingMemory } from './type/state';
import { retryWithBackoff } from './tools/retry-wrapper';
import { evictStaleEntries, flushToDisk, getWorkingMemory, pendingWrites, runtime, store, toSerializable } from './working-memory.part-01-working-memory-entry';

/**
 * Clear working memory for a thread (e.g., when conversation ends).
 * Also deletes from DB.
 */
export function clearWorkingMemory(threadId: string): void {
  const pending = pendingWrites.get(threadId);
  if (pending) {
    clearTimeout(pending);
    pendingWrites.delete(threadId);
  }
  store.delete(threadId);
  if (runtime.repository) {
    runtime.repository.delete(threadId).catch((err) => {
      console.error(`[working-memory] DB delete failed for ${threadId}:`, err);
    });
  }
}

/**
 * Evicts a thread from the process-local working-memory cache without deleting
 * persisted data. Used for cache TTL/LRU eviction; explicit conversation reset
 * should continue to call `clearWorkingMemory`.
 */
export function evictWorkingMemoryFromCache(threadId: string): void {
  flushToDisk(threadId);
  store.delete(threadId);
}

/**
 * Check if a specific working memory key has data.
 */
export function hasWorkingMemoryData(threadId: string, key: keyof WorkingMemory): boolean {
  const entry = store.get(threadId);
  if (!entry) return false;
  const val = entry.data[key];
  if (val === undefined || val === null) return false;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

/**
 * Returns the current number of active threads in working memory.
 * Useful for monitoring/debugging.
 */
export function getWorkingMemorySize(): number {
  return store.size;
}

/**
 * Flushes all dirty entries to DB. Call on graceful server shutdown.
 */
export async function flushAllWorkingMemory(): Promise<void> {
  if (!runtime.repository) return;
  const promises: Promise<void>[] = [];
  for (const [threadId, entry] of store) {
    const pending = pendingWrites.get(threadId);
    if (pending) {
      clearTimeout(pending);
      pendingWrites.delete(threadId);
    }
    if (entry.dirty) {
      promises.push(
        retryWithBackoff(() => runtime.repository!.save(threadId, toSerializable(entry.data)), {
          attempts: 3,
          baseMs: 100,
        })
          .then(() => {
            entry.dirty = false;
          })
          .catch((err) => {
            console.error(
              `[working-memory] Flush-all failed after 3 attempts for ${threadId}:`,
              err instanceof Error ? err.message : err,
            );
          }),
      );
    }
  }
  await Promise.all(promises);
}

// ── Per-threadId locking for concurrent tool access ──

/**
 * Per-threadId promise chains for serialized access.
 * Each threadId gets its own sequential queue of pending operations.
 */
export const locks = new Map<string, Promise<void>>();

/**
 * Executes a callback with exclusive access to the working memory for a given threadId.
 * Operations on the same threadId are serialized; different threadIds run concurrently.
 */
export async function withWorkingMemoryLock<T>(
  threadId: string,
  fn: (mem: WorkingMemory) => T | Promise<T>,
): Promise<T> {
  const prev = locks.get(threadId) ?? Promise.resolve();

  let resolve: () => void;
  const next = new Promise<void>((r) => {
    resolve = r;
  });
  locks.set(threadId, next);

  try {
    await prev;
    const mem = getWorkingMemory(threadId);
    return await fn(mem);
  } finally {
    resolve!();
    if (locks.get(threadId) === next) {
      locks.delete(threadId);
    }
  }
}

/**
 * Atomic read-modify-write for working memory.
 * Safer alternative to separate get + update calls in concurrent tool execution.
 */
export async function updateWorkingMemoryAsync(
  threadId: string,
  updater: (mem: WorkingMemory) => Partial<WorkingMemory>,
): Promise<void> {
  await withWorkingMemoryLock(threadId, (mem) => {
    const update = updater(mem);
    Object.assign(mem, update);
  });
}

/**
 * Test-only helper to fully reset the in-process working memory store.
 * Drops all entries, pending debounce timers, and per-thread locks, and
 * stops the background cleanup timer if running. Used by integration / unit
 * tests to guarantee isolation between cases.
 */
export function _resetWorkingMemoryForTesting(): void {
  store.clear();
  for (const timer of pendingWrites.values()) clearTimeout(timer);
  pendingWrites.clear();
  locks.clear();
  if (runtime.cleanupTimer) {
    clearInterval(runtime.cleanupTimer);
    runtime.cleanupTimer = null;
  }
  runtime.repository = null;
}

/**
 * Test-only helper to drive eviction synchronously without waiting for the
 * background interval. Triggers the same TTL + LRU sweep used by the timer.
 */
export function _runEvictionForTesting(): void {
  evictStaleEntries();
}
