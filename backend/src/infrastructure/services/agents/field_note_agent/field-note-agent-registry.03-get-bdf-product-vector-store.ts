import { BdfProductVectorStore } from './rag';
import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export function fieldNoteAgentRegistryGetBdfProductVectorStore(this: FieldNoteAgentRegistryContext, threadId: string): BdfProductVectorStore | null {
    const cached = this.cache.get(threadId);
    return cached?.bdfProductVectorStore ?? null;
  }
