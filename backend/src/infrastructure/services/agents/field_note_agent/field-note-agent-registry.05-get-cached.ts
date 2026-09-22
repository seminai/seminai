import { CachedAgentEntry } from './field-note-agent-registry.support';
import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export function fieldNoteAgentRegistryGetCached(this: FieldNoteAgentRegistryContext, threadId: string): CachedAgentEntry | undefined {
    return this.cache.get(threadId);
  }
