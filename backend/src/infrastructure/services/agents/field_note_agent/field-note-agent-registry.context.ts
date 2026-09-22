/**
 * Field Note Agent Registry
 *
 * Manages agent app instances and persists conversation history to Prisma.
 * Solves the problem of losing conversation context between HTTP requests
 * by maintaining a cache of agent apps keyed by threadId.
 */

/**
 * Field Note Agent Registry
 *
 * Manages agent app instances and persists conversation history to Prisma.
 * Solves the problem of losing conversation context between HTTP requests
 * by maintaining a cache of agent apps keyed by threadId.
 */
import { PrismaClient, MessageRole, AgentResponseStatus } from '@prisma/client';
import { BaseMessage } from '@langchain/core/messages';
import { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { BdfProductVectorStore } from './rag';
import { CachedAgentEntry, PendingToolCall, GetOrCreateAgentOptions } from './field-note-agent-registry.support';

export interface FieldNoteAgentRegistryContext {
  readonly cache: Map<string, CachedAgentEntry>;
  readonly ttlMs: number;
  cleanupInterval: NodeJS.Timeout | null;
  getOrCreateApp(options: GetOrCreateAgentOptions): Promise<{
    app: FieldNoteAgentApp;
    chatId: string;
    isNew: boolean;
  }>;
  saveMessage(prisma: PrismaClient, chatId: string, role: MessageRole, content: string, options?: {
      status?: AgentResponseStatus;
      pendingToolCalls?: PendingToolCall[];
      error?: string;
      metadata?: Record<string, unknown>;
    }): Promise<void>;
  getBdfProductVectorStore(threadId: string): BdfProductVectorStore | null;
  setBdfProductVectorStore(threadId: string, store: BdfProductVectorStore): void;
  getCached(threadId: string): CachedAgentEntry | undefined;
  remove(threadId: string): void;
  clear(): void;
  convertPrismaMessagesToLangChain(messages: Array<{
      role: MessageRole;
      content: string;
      pendingToolCalls?: unknown;
      metadata?: unknown;
    }>): BaseMessage[];
  cleanupStaleEntries(): void;
  shutdown(): void;
}
