import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { PrismaClient } from '@prisma/client';
import type { AgentResponse } from './types';
import { createFieldNoteRunConfig } from './runtime';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { APPROVAL_CONFIRMATION_MESSAGE, IDEMPOTENT_NO_OP_MESSAGE, clearFieldNotePendingAction } from './field-note-operations.part-01-approval-confirmation-message';
import { executeSaveToolsDirectAndFinalize, handlePendingToolCalls } from './field-note-operations.part-02-execute-save-tools-direct-and-finalize';

/**
 * Approves and executes pending tool calls.
 * Continues the agent execution after human approval.
 *
 * When the agent asked for confirmation via text (no pending tool_calls),
 * we inject an approval HumanMessage so the agent can generate the
 * save_field_note tool calls, then execute them.
 */
export async function approveAndExecute(
  app: FieldNoteAgentApp,
  threadId: string,
  prisma?: PrismaClient,
  userId?: string,
): Promise<AgentResponse> {
  const config = createFieldNoteRunConfig(threadId);

  try {
    const currentState = await app.getState(config);

    // Idempotency gate: if no approval is pending on this thread, the operation
    // was already completed (or cancelled) by an earlier call — answer no-op
    // instead of replaying the save and creating duplicate rows.
    if (!currentState.values.pendingAction) {
      console.info(
        `${LOG_PREFIX.HANDLER} approveAndExecute: no pendingAction on thread (idempotent no-op)`,
      );
      return { status: 'COMPLETED', message: IDEMPOTENT_NO_OP_MESSAGE };
    }

    const currentLastMessage =
      currentState.values.messages[currentState.values.messages.length - 1];

    const hasPendingToolCalls =
      currentLastMessage instanceof AIMessage &&
      currentLastMessage.tool_calls &&
      currentLastMessage.tool_calls.length > 0;

    if (hasPendingToolCalls && currentLastMessage instanceof AIMessage) {
      const stateNext = (currentState as { next?: string[] }).next;
      const isGraphFinished = !stateNext || stateNext.length === 0;
      if (isGraphFinished && prisma && userId) {
        const result = await executeSaveToolsDirectAndFinalize(
          app,
          config,
          currentLastMessage.tool_calls!.map((tc) => ({
            name: tc.name,
            args: tc.args as Record<string, unknown>,
            id: tc.id || '',
          })),
          prisma,
          userId,
        );
        await clearFieldNotePendingAction(app, config);
        return result;
      }

      const result = await handlePendingToolCalls(app, config, currentLastMessage, prisma, userId);
      if (result) {
        if (result.status === 'COMPLETED') {
          await clearFieldNotePendingAction(app, config);
        }
        return result;
      }
    }

    if (!hasPendingToolCalls) {
      // Check if the graph has genuinely finished (next nodes list is empty).
      // When the graph is at END, re-entering with an approval message would
      // cause the agent to re-propose already-completed operations in a loop.
      const stateNext = (currentState as { next?: string[] }).next;
      const isGraphFinished = !stateNext || stateNext.length === 0;

      if (isGraphFinished) {
        console.log(
          `${LOG_PREFIX.HANDLER} Graph has finished — no pending operations. Returning COMPLETED.`,
        );
        const lastAI = currentState.values.messages
          .slice()
          .reverse()
          .find((m: BaseMessage) => m instanceof AIMessage) as AIMessage | undefined;
        await clearFieldNotePendingAction(app, config);
        return {
          status: 'COMPLETED',
          message: (lastAI?.content as string) || FIELD_NOTE_MESSAGES.TOOL_EXECUTION_COMPLETED,
          pendingFieldNote: currentState.values.pendingFieldNote,
        };
      }

      console.log(
        `${LOG_PREFIX.HANDLER} No pending tool calls but graph not finished — agent asked for confirmation via text. Re-entering agent with approval message.`,
      );

      // Use stream(inputs) instead of updateState + stream(null) because the
      // graph may have reached END. stream(null) on a completed graph produces
      // no events, whereas stream(inputs) properly re-enters from START.
      const approvalStream = await app.stream(
        {
          messages: [new HumanMessage(APPROVAL_CONFIRMATION_MESSAGE)],
          toolCallCount: 0,
          lastToolCalls: [],
        },
        config,
      );
      let eventCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of approvalStream) {
        eventCount++;
      }

      console.log(`${LOG_PREFIX.HANDLER} Approval re-entry stream produced ${eventCount} events`);

      const newState = await app.getState(config);
      const newLastMessage = newState.values.messages[newState.values.messages.length - 1];

      if (newLastMessage instanceof AIMessage && newLastMessage.tool_calls?.length) {
        console.log(
          `${LOG_PREFIX.HANDLER} Agent generated ${newLastMessage.tool_calls.length} tool calls after approval message`,
        );
        const result = await handlePendingToolCalls(app, config, newLastMessage, prisma, userId);
        if (result) {
          if (result.status === 'COMPLETED') {
            await clearFieldNotePendingAction(app, config);
          }
          return result;
        }
      }

      if (newLastMessage instanceof AIMessage) {
        await clearFieldNotePendingAction(app, config);
        return {
          status: 'COMPLETED',
          message: newLastMessage.content as string,
          pendingFieldNote: newState.values.pendingFieldNote,
        };
      }
    }

    await clearFieldNotePendingAction(app, config);
    return {
      status: 'COMPLETED',
      message: FIELD_NOTE_MESSAGES.TOOL_EXECUTION_COMPLETED,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: errorMessage,
    };
  }
}
