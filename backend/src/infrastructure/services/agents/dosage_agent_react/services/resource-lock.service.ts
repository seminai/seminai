/**
 * Resource Lock Service — prevents concurrent agent conflicts.
 * Tracks which production units / entities are being actively worked on
 * by which thread, and warns when a second thread tries to modify the same resources.
 *
 * Uses an in-memory Map with TTL-based auto-expiry.
 * For multi-server deployments, replace with Redis-backed locks.
 */

/** Duration before a resource lock auto-expires (ms). */
const LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * A resource lock entry.
 */
interface ResourceLock {
  readonly threadId: string;
  readonly userId: string;
  readonly acquiredAt: number;
}

/**
 * Result of attempting to acquire a lock.
 */
export interface LockResult {
  readonly acquired: boolean;
  readonly conflictingThreadId?: string;
  readonly message?: string;
}

class ResourceLockServiceImpl {
  /** Map of resourceKey -> ResourceLock */
  private readonly locks = new Map<string, ResourceLock>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.evictExpired(), 60_000);
  }

  /**
   * Attempts to acquire a lock on a resource.
   * Returns success if no other thread holds the lock, or if the same thread already holds it.
   */
  tryAcquire(resourceKey: string, threadId: string, userId: string): LockResult {
    const existing = this.locks.get(resourceKey);
    if (existing) {
      if (existing.threadId === threadId) {
        return { acquired: true };
      }
      if (Date.now() - existing.acquiredAt < LOCK_TTL_MS) {
        return {
          acquired: false,
          conflictingThreadId: existing.threadId,
          message:
            'Un altro agente sta lavorando su questa risorsa. Attendere o procedere con cautela.',
        };
      }
      // Expired lock — can be overwritten
    }
    this.locks.set(resourceKey, { threadId, userId, acquiredAt: Date.now() });
    return { acquired: true };
  }

  /**
   * Acquires locks on multiple production unit resources.
   * Returns warnings for any conflicting locks.
   */
  tryAcquireProductionUnits(
    productionUnitIds: ReadonlyArray<string>,
    threadId: string,
    userId: string,
  ): { acquired: boolean; conflicts: readonly LockResult[] } {
    const conflicts: LockResult[] = [];
    let allAcquired = true;
    for (const puId of productionUnitIds) {
      const key = `${userId}:pu:${puId}`;
      const result = this.tryAcquire(key, threadId, userId);
      if (!result.acquired) {
        allAcquired = false;
        conflicts.push(result);
      }
    }
    return { acquired: allAcquired, conflicts };
  }

  /**
   * Releases all locks held by a specific thread.
   */
  releaseThread(threadId: string): number {
    let released = 0;
    for (const [key, lock] of this.locks) {
      if (lock.threadId === threadId) {
        this.locks.delete(key);
        released++;
      }
    }
    return released;
  }

  /**
   * Releases a specific resource lock if held by the given thread.
   */
  release(resourceKey: string, threadId: string): boolean {
    const existing = this.locks.get(resourceKey);
    if (existing && existing.threadId === threadId) {
      this.locks.delete(resourceKey);
      return true;
    }
    return false;
  }

  /**
   * Returns all active locks for a user.
   */
  getLocksForUser(userId: string): ReadonlyArray<{ resourceKey: string; threadId: string }> {
    const result: Array<{ resourceKey: string; threadId: string }> = [];
    for (const [key, lock] of this.locks) {
      if (lock.userId === userId) {
        result.push({ resourceKey: key, threadId: lock.threadId });
      }
    }
    return result;
  }

  /** Removes expired locks. */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, lock] of this.locks) {
      if (now - lock.acquiredAt >= LOCK_TTL_MS) {
        this.locks.delete(key);
      }
    }
  }

  /** Stops the cleanup timer (call on server shutdown). */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

/** Singleton instance. */
let instance: ResourceLockServiceImpl | null = null;

export function getResourceLockService(): ResourceLockServiceImpl {
  if (!instance) {
    instance = new ResourceLockServiceImpl();
  }
  return instance;
}

export type ResourceLockService = ResourceLockServiceImpl;
