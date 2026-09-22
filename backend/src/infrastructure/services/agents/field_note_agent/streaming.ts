import { getFieldNoteAgentRegistry } from './FieldNoteAgentRegistry';
import { ChatModel } from './graph';
import type { AgentResponse } from './types';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { PrismaClient, MessageRole, AgentResponseStatus } from '@prisma/client';
import { createFieldNoteRunConfig } from './runtime';

/**
 * Stream event types emitted during agent execution.
 */
export type StreamEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'complete'
  | 'requires_approval'
  | 'error';

/**
 * Stream event emitted during agent execution.
 */
export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  error?: string;
  response?: AgentResponse;
}

/**
 * Options for streaming field note agent execution.
 */
export interface StreamFieldNoteAgentOptions {
  threadId: string;
  userMessage: string;
  userId: string;
  prisma: PrismaClient;
  modelName?: ChatModel;
  temperature?: number;
}

interface PendingToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

/**
 * Streams field note agent chat execution.
 * Yields tokens, tool calls, and final response.
 *
 * @param options Streaming options
 * @returns Async generator yielding stream events
 */
export async function* streamFieldNoteAgentChat(
  options: StreamFieldNoteAgentOptions,
): AsyncGenerator<StreamEvent, AgentResponse, unknown> {
  const { threadId, userMessage, userId, prisma, modelName, temperature } = options;

  // Use registry to get or create agent app (with conversation history)
  const registry = getFieldNoteAgentRegistry();
  const { app, chatId } = await registry.getOrCreateApp({
    threadId,
    userId,
    prisma,
    modelName: modelName || 'gpt-4o',
    temperature,
  });

  // Save user message to Prisma
  await registry.saveMessage(prisma, chatId, MessageRole.USER, userMessage);

  try {
    const config = createFieldNoteRunConfig(threadId);

    const inputs = {
      messages: [new HumanMessage(userMessage)],
      toolCallCount: 0,
      lastToolCalls: [],
    };

    // Stream events from LangGraph
    const stream = await app.stream(inputs, config);

    let accumulatedContent = '';
    let lastAIMessageContent = '';

    for await (const event of stream) {
      // Track tool calls
      if (event.tools) {
        for (const toolCall of event.tools || []) {
          yield {
            type: 'tool_call',
            toolCall: {
              name: toolCall.name,
              args: toolCall.args || {},
              id: toolCall.id,
            },
          };
        }
      }

      // Track agent responses (tokens)
      if (event.agent?.messages) {
        const lastMessage = event.agent.messages[event.agent.messages.length - 1];
        if (lastMessage instanceof AIMessage && lastMessage.content) {
          const newContent = lastMessage.content.toString();
          if (newContent.length > lastAIMessageContent.length) {
            const chunk = newContent.slice(lastAIMessageContent.length);
            accumulatedContent = newContent;
            lastAIMessageContent = newContent;
            yield {
              type: 'token',
              content: chunk,
            };
          }
        }
      }
    }

    // Get final state
    const stateSnapshot = await app.getState(config);
    const lastMessage = stateSnapshot.values.messages[
      stateSnapshot.values.messages.length - 1
    ] as AIMessage;
    const toolCalls = getToolCalls(lastMessage);

    // Check if approval is needed
    if (toolCalls && toolCalls.length > 0) {
      // Save assistant message requiring approval
      const messageContent = lastMessage.content?.toString() || '';
      await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, messageContent, {
        status: AgentResponseStatus.REQUIRES_APPROVAL,
        pendingToolCalls: toolCalls,
      });

      yield {
        type: 'requires_approval',
        toolCall: {
          name: toolCalls[0].name,
          args: toolCalls[0].args,
          id: toolCalls[0].id,
        },
      };
      return {
        status: 'REQUIRES_APPROVAL',
        pendingToolCalls: toolCalls,
      } as AgentResponse;
    }

    // Get final AI message
    const lastAIMessage = stateSnapshot.values.messages
      .slice()
      .reverse()
      .find((msg): msg is AIMessage => msg instanceof AIMessage);

    const finalMessage =
      lastAIMessage?.content?.toString() || accumulatedContent || 'No response generated';

    // Save completed assistant message
    await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, finalMessage, {
      status: AgentResponseStatus.COMPLETED,
    });

    // Emit final event
    yield {
      type: 'complete',
      response: {
        status: 'COMPLETED',
        message: finalMessage,
        pendingFieldNote: stateSnapshot.values.pendingFieldNote,
      },
    };

    return {
      status: 'COMPLETED',
      message: finalMessage,
      pendingFieldNote: stateSnapshot.values.pendingFieldNote,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // Save error message
    await registry.saveMessage(prisma, chatId, MessageRole.ASSISTANT, errorMessage, {
      status: AgentResponseStatus.ERROR,
      error: errorMessage,
    });

    yield {
      type: 'error',
      error: errorMessage,
    };
    return {
      status: 'ERROR',
      error: errorMessage,
    };
  }
}

function getToolCalls(message: AIMessage): PendingToolCall[] | undefined {
  const messageWithTools = message as AIMessage & { tool_calls?: unknown };
  const rawToolCalls = messageWithTools.tool_calls;
  if (!Array.isArray(rawToolCalls)) {
    return undefined;
  }
  const parsedToolCalls = rawToolCalls
    .map((toolCall) => parseToolCall(toolCall))
    .filter((toolCall): toolCall is PendingToolCall => toolCall !== null);
  return parsedToolCalls.length > 0 ? parsedToolCalls : undefined;
}

function parseToolCall(toolCall: unknown): PendingToolCall | null {
  if (!toolCall || typeof toolCall !== 'object') {
    return null;
  }
  const raw = toolCall as {
    name?: unknown;
    args?: unknown;
    id?: unknown;
  };
  if (typeof raw.name !== 'string') {
    return null;
  }
  if (!raw.args || typeof raw.args !== 'object') {
    return null;
  }
  const id = typeof raw.id === 'string' ? raw.id : '';
  return {
    name: raw.name,
    args: raw.args as Record<string, unknown>,
    id,
  };
}
