import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export function fieldNoteAgentRegistryClear(this: FieldNoteAgentRegistryContext): void {
    this.cache.clear();
  }
