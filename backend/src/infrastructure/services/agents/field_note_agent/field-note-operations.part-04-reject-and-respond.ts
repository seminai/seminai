import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import type { AgentResponse, AgentState } from './types';
import { createFieldNoteRunConfig } from './runtime';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { cancelPendingToolCalls } from '../shared/hitl/cancel-pending-tool-calls';
import { IDEMPOTENT_NO_OP_MESSAGE, clearFieldNotePendingAction } from './field-note-operations.part-01-approval-confirmation-message';

/**
 * Rejects pending tool calls and provides feedback.
 * The user can provide corrections or additional information.
 */
export async function rejectAndRespond(
  app: FieldNoteAgentApp,
  threadId: string,
  feedback: string,
): Promise<AgentResponse> {
  const config = createFieldNoteRunConfig(threadId);

  try {
    const currentState = await app.getState(config);

    // Idempotency gate: a reject with no pending approval is a no-op.
    if (!currentState.values.pendingAction) {
      console.info(
        `${LOG_PREFIX.HANDLER} rejectAndRespond: no pendingAction on thread (idempotent no-op)`,
      );
      return { status: 'COMPLETED', message: IDEMPOTENT_NO_OP_MESSAGE };
    }

    const currentMessages = currentState.values.messages;
    const lastMsg = currentMessages[currentMessages.length - 1];

    let stream;
    if (lastMsg instanceof AIMessage && lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
      // Graph is paused at interruptBefore — cancel pending calls and inject feedback
      await cancelPendingToolCalls({
        app: app as unknown as import('../shared/hitl/types').HitlAgentApp,
        config,
        reason: feedback,
        asNode: 'save_tools',
      });
      await app.updateState(
        config,
        { messages: [new HumanMessage(feedback)], toolCallCount: 0, lastToolCalls: [] },
        'save_tools',
      );
      stream = await app.stream(null, config);
    } else {
      // Graph at END — use stream(inputs) to re-enter from START
      stream = await app.stream(
        { messages: [new HumanMessage(feedback)], toolCallCount: 0, lastToolCalls: [] },
        config,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of stream) {
      /* consume */
    }

    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;
    const lastMessage = state.messages[state.messages.length - 1];

    if (
      lastMessage instanceof AIMessage &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      return {
        status: 'REQUIRES_APPROVAL',
        message: lastMessage.content as string,
        pendingToolCalls: lastMessage.tool_calls.map((tc) => ({
          name: tc.name,
          args: tc.args as Record<string, unknown>,
          id: tc.id || '',
        })),
      };
    }

    if (lastMessage instanceof AIMessage) {
      await clearFieldNotePendingAction(app, config);
      return {
        status: 'COMPLETED',
        message: lastMessage.content as string,
      };
    }

    await clearFieldNotePendingAction(app, config);
    return {
      status: 'COMPLETED',
      message: FIELD_NOTE_MESSAGES.FEEDBACK_PROCESSED,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: errorMessage,
    };
  }
}

/**
 * Gets the current conversation state.
 */
export async function getConversationState(
  app: FieldNoteAgentApp,
  threadId: string,
): Promise<AgentState> {
  const config = createFieldNoteRunConfig(threadId);
  const stateSnapshot = await app.getState(config);
  return stateSnapshot.values;
}
