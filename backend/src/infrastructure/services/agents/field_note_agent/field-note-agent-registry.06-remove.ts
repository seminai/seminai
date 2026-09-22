import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export function fieldNoteAgentRegistryRemove(this: FieldNoteAgentRegistryContext, threadId: string): void {
    this.cache.delete(threadId);
  }
