import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export function fieldNoteAgentRegistryShutdown(this: FieldNoteAgentRegistryContext): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
