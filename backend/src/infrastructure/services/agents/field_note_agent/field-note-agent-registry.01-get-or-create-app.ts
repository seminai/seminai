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
import { ChatCategory } from '@prisma/client';
import { createFieldNoteAgentApp, FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { LOG_PREFIX } from './messages';
import { createFieldNoteRunConfig } from './runtime';
import { createLangGraphCheckpointer } from '../shared/checkpointer-factory';
import { buildPendingAction, GetOrCreateAgentOptions } from './field-note-agent-registry.support';
import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export async function fieldNoteAgentRegistryGetOrCreateApp(this: FieldNoteAgentRegistryContext, options: GetOrCreateAgentOptions): Promise<{
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
