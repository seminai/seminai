import { BdfProductVectorStore } from './rag';
import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export function fieldNoteAgentRegistrySetBdfProductVectorStore(this: FieldNoteAgentRegistryContext, threadId: string, store: BdfProductVectorStore): void {
    const cached = this.cache.get(threadId);
    if (cached) {
      cached.bdfProductVectorStore = store;
    }
  }
