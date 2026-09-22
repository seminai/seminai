import { EventEmitter } from 'events';
import { getResourceLockService } from './resource-lock.service';
import { createUserRoomEmitter } from '../socket/user-room-emitter';

/**
 * Agent lifecycle states.
 */
export type AgentLifecycleState =
  | 'idle'
  | 'discovering'
  | 'planning'
  | 'executing_tool'
  | 'awaiting_approval'
  | 'completed'
  | 'error';

/**
 * Intent announcement from an agent before starting a pipeline.
 */
export interface AgentIntent {
  readonly threadId: string;
  readonly userId: string;
  readonly action: string;
  readonly targets: readonly string[];
  readonly announcedAt: number;
}

/**
 * Conflict detected between two agents.
 */
export interface AgentConflict {
  readonly sourceThreadId: string;
  readonly conflictingThreadId: string;
  readonly resourceDescription: string;
  readonly targets: readonly string[];
}

/**
 * Tracks agent lifecycle state and coordinates between agents.
 * Builds on UserSessionBus (P1-5) and ResourceLockService (P1-6).
 */
class AgentCoordinatorImpl {
  private readonly emitter = new EventEmitter();
  /** Current state per threadId. */
  private readonly states = new Map<string, AgentLifecycleState>();
  /** Active intents per threadId. */
  private readonly intents = new Map<string, AgentIntent>();
  /** threadId → userId mapping. */
  private readonly threadUsers = new Map<string, string>();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  /**
   * Registers an agent thread with its userId.
   */
  registerThread(threadId: string, userId: string): void {
    this.threadUsers.set(threadId, userId);
    this.transitionState(threadId, 'idle');
  }

  /**
   * Unregisters an agent thread.
   */
  unregisterThread(threadId: string): void {
    const userId = this.threadUsers.get(threadId);
    this.states.delete(threadId);
    this.intents.delete(threadId);
    this.threadUsers.delete(threadId);
    getResourceLockService().releaseThread(threadId);
    if (userId) {
      this.broadcastStatus(userId);
    }
  }

  /**
   * Transitions an agent to a new lifecycle state.
   * Broadcasts the change to the user's multi-agent dashboard.
   */
  transitionState(threadId: string, newState: AgentLifecycleState, currentTool?: string): void {
    this.states.set(threadId, newState);
    const userId = this.threadUsers.get(threadId);
    if (!userId) return;
    const emitter = createUserRoomEmitter(userId);
    emitter?.emitAgentStatus({
      threadId,
      status: newState,
      currentTool,
      timestamp: Date.now(),
    });
  }

  /**
   * Gets the current state of an agent.
   */
  getState(threadId: string): AgentLifecycleState {
    return this.states.get(threadId) ?? 'idle';
  }

  /**
   * Announces an intent to work on specific targets (production units, etc.).
   * Checks for conflicts with other agents and returns any detected conflicts.
   */
  announceIntent(intent: AgentIntent): readonly AgentConflict[] {
    this.intents.set(intent.threadId, intent);
    const conflicts: AgentConflict[] = [];
    // Check for overlapping intents from other agents of the same user
    for (const [otherThreadId, otherIntent] of this.intents) {
      if (otherThreadId === intent.threadId) continue;
      if (otherIntent.userId !== intent.userId) continue;
      const overlapping = intent.targets.filter((t) => otherIntent.targets.includes(t));
      if (overlapping.length > 0) {
        conflicts.push({
          sourceThreadId: intent.threadId,
          conflictingThreadId: otherThreadId,
          resourceDescription: `${overlapping.length} unità produttive in comune`,
          targets: overlapping,
        });
      }
    }
    // Also check resource locks
    const lockService = getResourceLockService();
    for (const target of intent.targets) {
      const lockResult = lockService.tryAcquire(
        `${intent.userId}:pu:${target}`,
        intent.threadId,
        intent.userId,
      );
      if (!lockResult.acquired) {
        conflicts.push({
          sourceThreadId: intent.threadId,
          conflictingThreadId: lockResult.conflictingThreadId ?? 'unknown',
          resourceDescription: `Risorsa ${target} già in uso`,
          targets: [target],
        });
      }
    }
    // Broadcast conflicts to the user dashboard
    if (conflicts.length > 0) {
      const userEmitter = createUserRoomEmitter(intent.userId);
      for (const conflict of conflicts) {
        userEmitter?.emitContentionWarning({
          threadId: conflict.sourceThreadId,
          conflictingThreadId: conflict.conflictingThreadId,
          resourceDescription: conflict.resourceDescription,
        });
      }
    }
    return conflicts;
  }

  /**
   * Clears the intent for a thread (pipeline completed or abandoned).
   */
  clearIntent(threadId: string): void {
    this.intents.delete(threadId);
  }

  /**
   * Returns all active agent sessions for a user.
   */
  getActiveAgents(userId: string): ReadonlyArray<{
    threadId: string;
    state: AgentLifecycleState;
    intent?: AgentIntent;
  }> {
    const result: Array<{
      threadId: string;
      state: AgentLifecycleState;
      intent?: AgentIntent;
    }> = [];
    for (const [threadId, uid] of this.threadUsers) {
      if (uid !== userId) continue;
      result.push({
        threadId,
        state: this.states.get(threadId) ?? 'idle',
        intent: this.intents.get(threadId),
      });
    }
    return result;
  }

  /**
   * Broadcasts the current session list to the user's dashboard.
   */
  private broadcastStatus(userId: string): void {
    const emitter = createUserRoomEmitter(userId);
    if (!emitter) return;
    const sessions = this.getActiveAgents(userId).map((a) => ({
      threadId: a.threadId,
      status: a.state,
      loopCounter: 0,
    }));
    emitter.emitSessionList(sessions);
  }
}

/** Singleton instance. */
let instance: AgentCoordinatorImpl | null = null;

export function getAgentCoordinator(): AgentCoordinatorImpl {
  if (!instance) {
    instance = new AgentCoordinatorImpl();
  }
  return instance;
}

export type AgentCoordinator = AgentCoordinatorImpl;
