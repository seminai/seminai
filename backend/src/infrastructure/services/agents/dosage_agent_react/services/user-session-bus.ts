import { EventEmitter } from 'events';
import { updateWorkingMemory, getWorkingMemory } from '../working-memory';

/**
 * Data types that can be shared across agents for the same user.
 */
export type SharedDataType = 'companies' | 'production_units' | 'fields' | 'products';

/**
 * A discovery event broadcast to other agents of the same user.
 */
export interface SharedDiscovery {
  readonly userId: string;
  readonly sourceThreadId: string;
  readonly dataType: SharedDataType;
  readonly data: unknown;
  readonly version: number;
  readonly timestamp: number;
}

/**
 * In-memory event bus for cross-agent context sharing.
 * Agents for the same user can share discoveries (companies, fields, production units)
 * so that each agent doesn't have to re-fetch the same data.
 *
 * Uses an EventEmitter pattern scoped by userId. Each active agent thread
 * subscribes on creation and unsubscribes on eviction.
 */
class UserSessionBusImpl {
  private readonly emitter = new EventEmitter();
  /** Version counter per userId:dataType to prevent stale overwrites. */
  private readonly versions = new Map<string, number>();
  /** Set of active threadIds per userId for tracking subscriptions. */
  private readonly activeThreads = new Map<string, Set<string>>();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  /**
   * Publishes a discovery to all other agents of the same user.
   * Increments the version counter for conflict resolution.
   */
  publish(userId: string, sourceThreadId: string, dataType: SharedDataType, data: unknown): void {
    const versionKey = `${userId}:${dataType}`;
    const currentVersion = (this.versions.get(versionKey) ?? 0) + 1;
    this.versions.set(versionKey, currentVersion);
    const event: SharedDiscovery = {
      userId,
      sourceThreadId,
      dataType,
      data,
      version: currentVersion,
      timestamp: Date.now(),
    };
    this.emitter.emit(`user:${userId}`, event);
  }

  /**
   * Subscribes an agent thread to discoveries from other agents of the same user.
   * Updates the thread's working memory when relevant data arrives.
   */
  subscribe(userId: string, threadId: string): void {
    if (!this.activeThreads.has(userId)) {
      this.activeThreads.set(userId, new Set());
    }
    this.activeThreads.get(userId)!.add(threadId);
    const handler = (event: SharedDiscovery) => {
      if (event.sourceThreadId === threadId) return;
      this.applyToWorkingMemory(threadId, event);
    };
    this.emitter.on(`user:${userId}`, handler);
    // Store handler reference for cleanup
    const cleanupKey = `${userId}:${threadId}`;
    this.handlers.set(cleanupKey, handler);
  }

  /**
   * Unsubscribes an agent thread from the bus.
   */
  unsubscribe(userId: string, threadId: string): void {
    const cleanupKey = `${userId}:${threadId}`;
    const handler = this.handlers.get(cleanupKey);
    if (handler) {
      this.emitter.removeListener(`user:${userId}`, handler);
      this.handlers.delete(cleanupKey);
    }
    this.activeThreads.get(userId)?.delete(threadId);
  }

  /**
   * Returns the set of active thread IDs for a user.
   */
  getActiveThreads(userId: string): ReadonlySet<string> {
    return this.activeThreads.get(userId) ?? new Set();
  }

  private readonly handlers = new Map<string, (event: SharedDiscovery) => void>();

  /**
   * Maps shared discovery data to the appropriate working memory key.
   */
  private applyToWorkingMemory(threadId: string, event: SharedDiscovery): void {
    const wm = getWorkingMemory(threadId);
    const wmVersion = (wm as Record<string, unknown>)[`_shared_${event.dataType}_version`] as
      | number
      | undefined;
    if (wmVersion !== undefined && wmVersion >= event.version) return;
    const update: Record<string, unknown> = {
      [`_shared_${event.dataType}_version`]: event.version,
    };
    switch (event.dataType) {
      case 'companies':
        // Don't overwrite if the thread already has this data from its own discovery
        if (!wm.inputProducts) update.inputProducts = event.data;
        break;
      case 'fields':
        if (!wm.userFields) update.userFields = event.data;
        break;
      case 'production_units':
        if (!wm.expandedUnits) update.expandedUnits = event.data;
        break;
      case 'products':
        if (!wm.inputProducts) update.inputProducts = event.data;
        break;
    }
    updateWorkingMemory(threadId, update);
  }
}

/** Singleton bus instance. */
let busInstance: UserSessionBusImpl | null = null;

export function getUserSessionBus(): UserSessionBusImpl {
  if (!busInstance) {
    busInstance = new UserSessionBusImpl();
  }
  return busInstance;
}

export type UserSessionBus = UserSessionBusImpl;
