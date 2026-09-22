import { LOG_PREFIX } from './messages';
import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export function fieldNoteAgentRegistryCleanupStaleEntries(this: FieldNoteAgentRegistryContext): void {
    const now = Date.now();
    for (const [threadId, entry] of this.cache.entries()) {
      if (now - entry.lastActivity.getTime() > this.ttlMs) {
        console.log(`${LOG_PREFIX.HANDLER} Cleaning up stale agent for thread: ${threadId}`);
        this.cache.delete(threadId);
      }
    }
  }
