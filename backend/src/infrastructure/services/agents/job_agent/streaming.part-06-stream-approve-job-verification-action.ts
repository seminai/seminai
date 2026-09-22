import { ChatModel, DEFAULT_RECURSION_LIMIT } from './graph';
import { AgentResponse } from './types';
import { createJobVerificationAgentApp } from './ChatJobVerificationAgent';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import { StreamEvent, asRecord, parsePossiblyJson } from './streaming.part-01-stream-event-type';
import { getToolResultSummary, getToolThinkingMessage } from './streaming.part-05-get-tool-thinking-message';

/**
 * Streaming function for approving an action.
 * Uses streamEvents() for real-time token streaming.
 */
export async function* streamApproveJobVerificationAction(
  threadId: string,
  userId?: string,
  modelName?: ChatModel,
): AsyncGenerator<StreamEvent, AgentResponse, unknown> {
  const app = createJobVerificationAgentApp({
    modelName: modelName || 'gpt-4o',
    userId,
  });

  const config = { configurable: { thread_id: threadId } };

  try {
    // Use streamEvents for real-time streaming
    const eventStream = app.streamEvents(null, {
      ...config,
      version: 'v2',
      recursionLimit: DEFAULT_RECURSION_LIMIT,
    });

    for await (const event of eventStream) {
      const eventType = event.event;
      const eventData = event.data;

      // Handle LLM token streaming
      if (eventType === 'on_llm_stream') {
        const chunk = eventData?.chunk;
        if (chunk instanceof AIMessageChunk && chunk.content) {
          const content = chunk.content.toString();
          if (content) {
            yield {
              type: 'token',
              content: content,
            };
          }
        }
      }

      // Handle tool events
      if (eventType === 'on_tool_start') {
        const toolName = event.name || 'unknown';
        const toolInput = asRecord(parsePossiblyJson(eventData?.input || {})) ?? {};
        yield {
          type: 'tool_start',
          toolCall: { name: toolName, args: toolInput },
          thinking: getToolThinkingMessage(toolName, toolInput),
        };
      }

      if (eventType === 'on_tool_end') {
        const toolName = event.name || 'unknown';
        const output = eventData?.output;
        const content = typeof output === 'string' ? output : JSON.stringify(output);
        const resultSummary = getToolResultSummary(toolName, content);

        yield {
          type: 'tool_result',
          toolResult: {
            name: toolName,
            result: content.length > 500 ? content.substring(0, 500) + '...' : content,
            summary: resultSummary,
          },
          thinking: resultSummary || 'Informazioni raccolte con successo',
        };
      }
    }

    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;

    if (state.requiresHumanInput && state.pendingAction) {
      yield {
        type: 'requires_modification_approval',
        pendingAction: state.pendingAction,
      };
      return {
        status: 'REQUIRES_MODIFICATION_APPROVAL',
        pendingAction: state.pendingAction,
      };
    }

    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

    yield {
      type: 'complete',
      sources: state.sources,
      response: {
        status: 'COMPLETED',
        message: state.finalAnswer || lastMessage?.content?.toString() || 'Azione completata.',
        sources: state.sources,
      },
    };

    return {
      status: 'COMPLETED',
      message: state.finalAnswer || lastMessage?.content?.toString() || 'Azione completata.',
      sources: state.sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
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
