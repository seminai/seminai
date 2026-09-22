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
import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';
import { fieldNoteAgentRegistryGetOrCreateApp } from './field-note-agent-registry.01-get-or-create-app';
import { fieldNoteAgentRegistrySaveMessage } from './field-note-agent-registry.02-save-message';
import { fieldNoteAgentRegistryGetBdfProductVectorStore } from './field-note-agent-registry.03-get-bdf-product-vector-store';
import { fieldNoteAgentRegistrySetBdfProductVectorStore } from './field-note-agent-registry.04-set-bdf-product-vector-store';
import { fieldNoteAgentRegistryGetCached } from './field-note-agent-registry.05-get-cached';
import { fieldNoteAgentRegistryRemove } from './field-note-agent-registry.06-remove';
import { fieldNoteAgentRegistryClear } from './field-note-agent-registry.07-clear';
import { fieldNoteAgentRegistryConvertPrismaMessagesToLangChain } from './field-note-agent-registry.08-convert-prisma-messages-to-lang-chain';
import { fieldNoteAgentRegistryCleanupStaleEntries } from './field-note-agent-registry.09-cleanup-stale-entries';
import { fieldNoteAgentRegistryShutdown } from './field-note-agent-registry.10-shutdown';

export { type GetOrCreateAgentOptions } from './field-note-agent-registry.support';

/**
 * Registry for managing Field Note Agent instances.
 * Provides caching and Prisma persistence for conversation history.
 */
export class FieldNoteAgentRegistry {

  private static instance: FieldNoteAgentRegistry;
  readonly cache: Map<string, CachedAgentEntry> = new Map();
  readonly ttlMs = 30 * 60 * 1000; // 30 minutes
  cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupStaleEntries(), 5 * 60 * 1000);
  }

  /**
   * Get the singleton instance.
   */
  public static getInstance(): FieldNoteAgentRegistry {
    if (!FieldNoteAgentRegistry.instance) {
      FieldNoteAgentRegistry.instance = new FieldNoteAgentRegistry();
    }
    return FieldNoteAgentRegistry.instance;
  }

  /**
   * Get or create an agent app for the given thread.
   * If a cached app exists for this threadId, returns it.
   * Otherwise, creates a new app and restores conversation history from Prisma.
   */
  public async getOrCreateApp(options: GetOrCreateAgentOptions): Promise<{
    app: FieldNoteAgentApp;
    chatId: string;
    isNew: boolean;
  }> {
    return fieldNoteAgentRegistryGetOrCreateApp.call(this as unknown as FieldNoteAgentRegistryContext, options);
  }

  /**
   * Save a message to Prisma.
   */
  public async saveMessage(
    prisma: PrismaClient,
    chatId: string,
    role: MessageRole,
    content: string,
    options?: {
      status?: AgentResponseStatus;
      pendingToolCalls?: PendingToolCall[];
      error?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    return fieldNoteAgentRegistrySaveMessage.call(this as unknown as FieldNoteAgentRegistryContext, prisma, chatId, role, content, options);
  }

  /**
   * Get the BDF product vector store for a thread.
   */
  public getBdfProductVectorStore(threadId: string): BdfProductVectorStore | null {
    return fieldNoteAgentRegistryGetBdfProductVectorStore.call(this as unknown as FieldNoteAgentRegistryContext, threadId);
  }

  /**
   * Set the BDF product vector store for a thread.
   */
  public setBdfProductVectorStore(threadId: string, store: BdfProductVectorStore): void {
    fieldNoteAgentRegistrySetBdfProductVectorStore.call(this as unknown as FieldNoteAgentRegistryContext, threadId, store);
  }

  /**
   * Get cached app entry (if exists).
   */
  public getCached(threadId: string): CachedAgentEntry | undefined {
    return fieldNoteAgentRegistryGetCached.call(this as unknown as FieldNoteAgentRegistryContext, threadId);
  }

  /**
   * Remove an entry from cache.
   */
  public remove(threadId: string): void {
    fieldNoteAgentRegistryRemove.call(this as unknown as FieldNoteAgentRegistryContext, threadId);
  }

  /**
   * Clear all cached entries.
   */
  public clear(): void {
    fieldNoteAgentRegistryClear.call(this as unknown as FieldNoteAgentRegistryContext);
  }

  /**
   * Convert Prisma messages to LangChain message format.
   */
  convertPrismaMessagesToLangChain(
    messages: Array<{
      role: MessageRole;
      content: string;
      pendingToolCalls?: unknown;
      metadata?: unknown;
    }>,
  ): BaseMessage[] {
    return fieldNoteAgentRegistryConvertPrismaMessagesToLangChain.call(this as unknown as FieldNoteAgentRegistryContext, messages);
  }

  /**
   * Cleanup stale cache entries.
   */
  cleanupStaleEntries(): void {
    fieldNoteAgentRegistryCleanupStaleEntries.call(this as unknown as FieldNoteAgentRegistryContext);
  }

  /**
   * Shutdown the registry (cleanup interval).
   */
  public shutdown(): void {
    fieldNoteAgentRegistryShutdown.call(this as unknown as FieldNoteAgentRegistryContext);
  }
}

export function getFieldNoteAgentRegistry(): FieldNoteAgentRegistry {
  return FieldNoteAgentRegistry.getInstance();
}
