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
import { MessageRole } from '@prisma/client';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { FieldNoteAgentRegistryContext } from './field-note-agent-registry.context';

export function fieldNoteAgentRegistryConvertPrismaMessagesToLangChain(this: FieldNoteAgentRegistryContext, messages: Array<{
      role: MessageRole;
      content: string;
      pendingToolCalls?: unknown;
      metadata?: unknown;
    }>): BaseMessage[] {
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
