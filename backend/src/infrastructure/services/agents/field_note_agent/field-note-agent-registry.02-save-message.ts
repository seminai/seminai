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
import { PrismaClient, Prisma, MessageRole, AgentResponseStatus } from '@prisma/client';
import { LOG_PREFIX } from './messages';
import { PendingToolCall } from './field-note-agent-registry.support';
import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export async function fieldNoteAgentRegistrySaveMessage(this: FieldNoteAgentRegistryContext, prisma: PrismaClient, chatId: string, role: MessageRole, content: string, options?: {
      status?: AgentResponseStatus;
      pendingToolCalls?: PendingToolCall[];
      error?: string;
      metadata?: Record<string, unknown>;
    }): Promise<void> {
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
