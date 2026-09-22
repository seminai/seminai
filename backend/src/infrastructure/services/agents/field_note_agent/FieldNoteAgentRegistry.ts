/**
 * Field Note Agent Registry
 *
 * Manages agent app instances and persists conversation history to Prisma.
 * Solves the problem of losing conversation context between HTTP requests
 * by maintaining a cache of agent apps keyed by threadId.
 */

import {
  PrismaClient,
  Prisma,
  ChatCategory,
  MessageRole,
  AgentResponseStatus,
} from '@prisma/client';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { createFieldNoteAgentApp, FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { ChatModel } from './graph';
import { LOG_PREFIX } from './messages';
import { BdfProductVectorStore } from './rag';
import { createFieldNoteRunConfig } from './runtime';
import { createLangGraphCheckpointer } from '../shared/checkpointer-factory';
import type { PendingFieldNoteAction } from './types';

/**
 * Cached agent app entry with metadata.
 */
interface CachedAgentEntry {
  app: FieldNoteAgentApp;
  userId: string;
  chatId: string;
  lastActivity: Date;
  modelName: ChatModel;
  bdfProductVectorStore: BdfProductVectorStore | null;
}

interface PendingToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

const SAVE_TOOL_NAMES = new Set([
  'save_field_note',
  'save_stock_in_purchase',
  'save_stock_in_harvest',
  'save_stock_out_sale',
  'save_stock_out_treatment',
]);

function buildPendingAction(messages: readonly BaseMessage[]): PendingFieldNoteAction | undefined {
  const lastMessage = messages[messages.length - 1] as
    | (AIMessage & {
        tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
      })
    | undefined;
  const toolCall = lastMessage?.tool_calls?.find((tc) => SAVE_TOOL_NAMES.has(tc.name));
  if (!toolCall) return undefined;
  return {
    tool: toolCall.name,
    args: toolCall.args,
    description: `Esecuzione ${toolCall.name}`,
    requiresApproval: true,
    riskLevel: 'medium',
  };
}

/**
 * Options for getting or creating an agent app.
 */
export interface GetOrCreateAgentOptions {
  threadId: string;
  userId: string;
  prisma: PrismaClient;
  modelName?: ChatModel;
  temperature?: number;
}

/**
 * Registry for managing Field Note Agent instances.
 * Provides caching and Prisma persistence for conversation history.
 */
export class FieldNoteAgentRegistry {
  private static instance: FieldNoteAgentRegistry;
  private readonly cache: Map<string, CachedAgentEntry> = new Map();
  private readonly ttlMs = 30 * 60 * 1000; // 30 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
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
    const { threadId, userId, prisma, modelName = 'gpt-4o', temperature } = options;

    // Check cache first
    const cached = this.cache.get(threadId);
    if (cached && cached.userId === userId) {
      cached.lastActivity = new Date();
      console.log(`${LOG_PREFIX.HANDLER} Using cached agent app for thread: ${threadId}`);
      return { app: cached.app, chatId: cached.chatId, isNew: false };
    }

    console.log(`${LOG_PREFIX.HANDLER} Creating new agent app for thread: ${threadId}`);

    // Find or create Chat in Prisma
    let chat = await prisma.chat.findUnique({
      where: { threadId },
      include: {
        messages: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    const isNew = !chat;

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          userId,
          threadId,
          category: ChatCategory.FIELD_NOTES,
          modelName,
          temperature: temperature ?? 0.1,
        },
        include: {
          messages: {
            orderBy: { sequence: 'asc' },
          },
        },
      });
      console.log(`${LOG_PREFIX.HANDLER} Created new Chat: ${chat.id}`);
    }

    // Share the Postgres checkpointer with the parent dosage_agent_react
    // through the singleton factory. Idempotent: subsequent calls reuse the
    // same PostgresSaver (or a MemorySaver in test/dev fallback).
    const checkpointer = await createLangGraphCheckpointer();

    // Create new agent app
    const app = createFieldNoteAgentApp({
      userId,
      prisma,
      modelName,
      temperature,
      threadId,
      checkpointer,
    });

    // Restore conversation history if exists
    if (chat.messages.length > 0) {
      console.log(`${LOG_PREFIX.HANDLER} Restoring ${chat.messages.length} messages from Prisma`);
      const langchainMessages = this.convertPrismaMessagesToLangChain(chat.messages);

      // Update the agent's state with historical messages
      const config = createFieldNoteRunConfig(threadId);
      try {
        const pendingAction = buildPendingAction(langchainMessages);
        await app.updateState(config, {
          messages: langchainMessages,
          pendingAction,
        });
        console.log(`${LOG_PREFIX.HANDLER} Restored conversation history successfully`);
      } catch (error) {
        console.warn(`${LOG_PREFIX.HANDLER} Failed to restore history, starting fresh:`, error);
      }
    }

    // Cache the app
    this.cache.set(threadId, {
      app,
      userId,
      chatId: chat.id,
      lastActivity: new Date(),
      modelName,
      bdfProductVectorStore: null,
    });

    return { app, chatId: chat.id, isNew };
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
    // Get the next sequence number
    const lastMessage = await prisma.message.findFirst({
      where: { chatId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });

    const sequence = (lastMessage?.sequence ?? -1) + 1;

    await prisma.message.create({
      data: {
        chatId,
        role,
        content,
        sequence,
        status: options?.status,
        pendingToolCalls: options?.pendingToolCalls
          ? (options.pendingToolCalls as unknown as Prisma.InputJsonValue)
          : undefined,
        error: options?.error,
        metadata: options?.metadata
          ? (options.metadata as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    console.log(`${LOG_PREFIX.HANDLER} Saved ${role} message to Prisma (seq: ${sequence})`);
  }

  /**
   * Get the BDF product vector store for a thread.
   */
  public getBdfProductVectorStore(threadId: string): BdfProductVectorStore | null {
    const cached = this.cache.get(threadId);
    return cached?.bdfProductVectorStore ?? null;
  }

  /**
   * Set the BDF product vector store for a thread.
   */
  public setBdfProductVectorStore(threadId: string, store: BdfProductVectorStore): void {
    const cached = this.cache.get(threadId);
    if (cached) {
      cached.bdfProductVectorStore = store;
    }
  }

  /**
   * Get cached app entry (if exists).
   */
  public getCached(threadId: string): CachedAgentEntry | undefined {
    return this.cache.get(threadId);
  }

  /**
   * Remove an entry from cache.
   */
  public remove(threadId: string): void {
    this.cache.delete(threadId);
  }

  /**
   * Clear all cached entries.
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Convert Prisma messages to LangChain message format.
   */
  private convertPrismaMessagesToLangChain(
    messages: Array<{
      role: MessageRole;
      content: string;
      pendingToolCalls?: unknown;
      metadata?: unknown;
    }>,
  ): BaseMessage[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case MessageRole.USER:
          return new HumanMessage(msg.content);
        case MessageRole.ASSISTANT:
          const aiMsg = new AIMessage(msg.content);
          // Restore tool calls if present
          if (msg.pendingToolCalls && Array.isArray(msg.pendingToolCalls)) {
            const aiMessageWithTools = aiMsg as AIMessage & { tool_calls?: unknown };
            aiMessageWithTools.tool_calls = msg.pendingToolCalls;
          }
          return aiMsg;
        case MessageRole.SYSTEM:
          return new SystemMessage(msg.content);
        case MessageRole.TOOL:
          // Tool messages need special handling
          const metadata = msg.metadata as { toolCallId?: string; name?: string } | null;
          return new ToolMessage({
            content: msg.content,
            tool_call_id: metadata?.toolCallId || 'unknown',
            name: metadata?.name,
          });
        default:
          return new HumanMessage(msg.content);
      }
    });
  }

  /**
   * Cleanup stale cache entries.
   */
  private cleanupStaleEntries(): void {
    const now = Date.now();
    for (const [threadId, entry] of this.cache.entries()) {
      if (now - entry.lastActivity.getTime() > this.ttlMs) {
        console.log(`${LOG_PREFIX.HANDLER} Cleaning up stale agent for thread: ${threadId}`);
        this.cache.delete(threadId);
      }
    }
  }

  /**
   * Shutdown the registry (cleanup interval).
   */
  public shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

/**
 * Get the singleton registry instance.
 */
export function getFieldNoteAgentRegistry(): FieldNoteAgentRegistry {
  return FieldNoteAgentRegistry.getInstance();
}
