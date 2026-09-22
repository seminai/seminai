import { IAgentRunRegistry } from '../../../domain/services/IAgentRunRegistry';

/**
 * In-memory registry of active agent stream runs keyed by threadId.
 *
 * Allows an out-of-band caller (e.g. POST /agent-chat/cancel) to reach the
 * AbortController of an in-flight `streamReactAgent` invocation and abort it.
 *
 * Lifecycle: the streaming layer registers its controller before invoking
 * `app.stream({signal})` and unregisters in a `finally` block.
 */
class AgentRunRegistry implements IAgentRunRegistry {
  private readonly controllers = new Map<string, AbortController>();

  register(threadId: string, controller: AbortController): void {
    this.controllers.get(threadId)?.abort();
    this.controllers.set(threadId, controller);
  }

  unregister(threadId: string, controller: AbortController): void {
    if (this.controllers.get(threadId) === controller) {
      this.controllers.delete(threadId);
    }
  }

  abort(threadId: string): boolean {
    const controller = this.controllers.get(threadId);
    if (!controller) return false;
    controller.abort();
    this.controllers.delete(threadId);
    return true;
  }

  isActive(threadId: string): boolean {
    return this.controllers.has(threadId);
  }
}

export const agentRunRegistry = new AgentRunRegistry();
