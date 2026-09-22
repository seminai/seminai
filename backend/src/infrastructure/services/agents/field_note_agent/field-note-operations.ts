import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { PrismaClient } from '@prisma/client';
import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import type { AgentResponse, AgentState } from './types';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { cancelPendingToolCalls } from '../shared/hitl/cancel-pending-tool-calls';
import { createFieldNoteRunConfig, type FieldNoteRunConfig } from './runtime';
import { saveFieldNote } from '../../tool/saveFieldNote';
import { saveStockInPurchase } from '../../tool/saveStockInPurchase';
import { saveStockInHarvest } from '../../tool/saveStockInHarvest';
import { saveStockOutSale } from '../../tool/saveStockOutSale';
import { saveStockOutTreatment } from '../../tool/saveStockOutTreatment';

const APPROVAL_CONFIRMATION_MESSAGE =
  'Sì, confermo. Procedi con il salvataggio di tutte le note di campo proposte.';

const IDEMPOTENT_NO_OP_MESSAGE = 'Operazione già completata o non più disponibile.';

type PendingToolCall = {
  name: string;
  args: Record<string, unknown>;
  id: string;
};

function extractCreatedIdsFromPayload(payload: unknown): {
  createdFieldNoteIds: string[];
  createdStockIds: string[];
} {
  if (!payload || typeof payload !== 'object') {
    return { createdFieldNoteIds: [], createdStockIds: [] };
  }
  const record = payload as Record<string, unknown>;
  return {
    createdFieldNoteIds: typeof record.fieldNoteId === 'string' ? [record.fieldNoteId] : [],
    createdStockIds: typeof record.stockId === 'string' ? [record.stockId] : [],
  };
}

function collectCreatedIdsFromToolMessages(messages: readonly BaseMessage[]): {
  createdFieldNoteIds: string[];
  createdStockIds: string[];
} {
  const createdFieldNoteIds = new Set<string>();
  const createdStockIds = new Set<string>();

  for (const message of messages) {
    if (!(message instanceof ToolMessage)) continue;
    try {
      const parsed = JSON.parse(String(message.content)) as unknown;
      const ids = extractCreatedIdsFromPayload(parsed);
      ids.createdFieldNoteIds.forEach((id) => createdFieldNoteIds.add(id));
      ids.createdStockIds.forEach((id) => createdStockIds.add(id));
    } catch {
      // Ignore non-JSON tool payloads.
    }
  }

  return {
    createdFieldNoteIds: [...createdFieldNoteIds],
    createdStockIds: [...createdStockIds],
  };
}

/**
 * Drops the pending approval sentinel on the sub-agent state. Best-effort: a
 * failure here only means a subsequent approve/reject may unnecessarily run
 * through a stale check, so we log and swallow.
 */
async function clearFieldNotePendingAction(
  app: FieldNoteAgentApp,
  config: FieldNoteRunConfig,
): Promise<void> {
  try {
    // `null` is the explicit clear sentinel handled by `pendingActionReducer`,
    // but the public AgentState type only exposes `T | undefined`. Cast to
    // bypass the type narrowing — the reducer interprets `null` correctly.
    await app.updateState(config, { pendingAction: null } as unknown as Partial<AgentState>);
  } catch (err) {
    console.warn(`${LOG_PREFIX.HANDLER} Failed to clear pendingAction:`, err);
  }
}

/**
 * Executes pending save_field_note tool calls (bulk path) and streams the
 * final AI response. Returns the agent response.
 */
async function executeBulkSaveAndFinalize(
  app: FieldNoteAgentApp,
  config: FieldNoteRunConfig,
  saveFieldNoteCalls: Array<{ name: string; args: Record<string, unknown>; id: string }>,
  prisma: PrismaClient,
  userId: string,
): Promise<AgentResponse> {
  console.log(
    `${LOG_PREFIX.HANDLER} Executing bulk save for ${saveFieldNoteCalls.length} field notes`,
  );

  const { executeBulkSaveFieldNotes } = await import('./toolHelpers.js');

  const toolCallsWithIds = saveFieldNoteCalls.map((tc) => ({
    args: tc.args,
    id: tc.id,
  }));

  const result = await executeBulkSaveFieldNotes(prisma, userId, toolCallsWithIds);

  console.log(
    `${LOG_PREFIX.HANDLER} Bulk save completed, created ${result.fieldNoteIds.length} notes`,
  );

  const toolMessages = saveFieldNoteCalls.map(
    (tc, idx) =>
      new ToolMessage({
        content: JSON.stringify({
          success: true,
          fieldNoteId: result.fieldNoteIds[idx],
          message: `Field note created successfully (bulk operation ${idx + 1}/${saveFieldNoteCalls.length})`,
        }),
        tool_call_id: tc.id,
      }),
  );

  await app.updateState(config, { messages: toolMessages });

  const stream = await app.stream(null, config);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _event of stream) {
    /* consume */
  }

  const finalState = await app.getState(config);
  const finalLastMessage = finalState.values.messages[finalState.values.messages.length - 1];

  if (finalLastMessage instanceof AIMessage) {
    return {
      status: 'COMPLETED',
      message: finalLastMessage.content as string,
      createdFieldNoteIds: result.fieldNoteIds,
      createdStockIds: [],
    };
  }

  return {
    status: 'COMPLETED',
    message: FIELD_NOTE_MESSAGES.TOOL_EXECUTION_COMPLETED,
    createdFieldNoteIds: result.fieldNoteIds,
    createdStockIds: [],
  };
}

async function executeSaveToolDirect(
  prisma: PrismaClient,
  userId: string,
  toolCall: PendingToolCall,
): Promise<Record<string, unknown>> {
  switch (toolCall.name) {
    case 'save_field_note':
      return (await saveFieldNote(userId, prisma, toolCall.args as never)) as unknown as Record<
        string,
        unknown
      >;
    case 'save_stock_in_purchase':
      return (await saveStockInPurchase(
        userId,
        prisma,
        toolCall.args as never,
      )) as unknown as Record<string, unknown>;
    case 'save_stock_in_harvest':
      return (await saveStockInHarvest(
        userId,
        prisma,
        toolCall.args as never,
      )) as unknown as Record<string, unknown>;
    case 'save_stock_out_sale':
      return (await saveStockOutSale(userId, prisma, toolCall.args as never)) as unknown as Record<
        string,
        unknown
      >;
    case 'save_stock_out_treatment':
      return (await saveStockOutTreatment(
        userId,
        prisma,
        toolCall.args as never,
      )) as unknown as Record<string, unknown>;
    default:
      throw new Error(`Tool non supportato per esecuzione diretta: ${toolCall.name}`);
  }
}

async function executeSaveToolsDirectAndFinalize(
  app: FieldNoteAgentApp,
  config: FieldNoteRunConfig,
  toolCalls: PendingToolCall[],
  prisma: PrismaClient,
  userId: string,
): Promise<AgentResponse> {
  console.log(
    `${LOG_PREFIX.HANDLER} Executing ${toolCalls.length} restored save tool call(s) directly`,
  );

  const createdFieldNoteIds = new Set<string>();
  const createdStockIds = new Set<string>();
  const toolMessages: ToolMessage[] = [];
  const resultMessages: string[] = [];

  for (const toolCall of toolCalls) {
    const result = await executeSaveToolDirect(prisma, userId, toolCall);
    const ids = extractCreatedIdsFromPayload(result);
    ids.createdFieldNoteIds.forEach((id) => createdFieldNoteIds.add(id));
    ids.createdStockIds.forEach((id) => createdStockIds.add(id));
    if (typeof result.message === 'string') {
      resultMessages.push(result.message);
    }
    toolMessages.push(
      new ToolMessage({
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
        name: toolCall.name,
      }),
    );
  }

  await app.updateState(config, { messages: toolMessages }, 'save_tools');

  const message =
    resultMessages.length > 0
      ? resultMessages.join('\n')
      : FIELD_NOTE_MESSAGES.TOOL_EXECUTION_COMPLETED;

  return {
    status: 'COMPLETED',
    message,
    createdFieldNoteIds: [...createdFieldNoteIds],
    createdStockIds: [...createdStockIds],
  };
}

/**
 * Handles execution of pending tool calls found in the current state.
 * Supports both bulk save_field_note calls and standard single-tool flow.
 * Returns null when there are no pending tool calls to handle.
 */
async function handlePendingToolCalls(
  app: FieldNoteAgentApp,
  config: FieldNoteRunConfig,
  lastMessage: AIMessage,
  prisma?: PrismaClient,
  userId?: string,
): Promise<AgentResponse | null> {
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return null;
  }

  const saveFieldNoteCalls = lastMessage.tool_calls.filter((tc) => tc.name === 'save_field_note');

  if (saveFieldNoteCalls.length > 1 && prisma && userId) {
    return executeBulkSaveAndFinalize(
      app,
      config,
      saveFieldNoteCalls.map((tc) => ({
        name: tc.name,
        args: tc.args as Record<string, unknown>,
        id: tc.id || '',
      })),
      prisma,
      userId,
    );
  }

  console.log(`${LOG_PREFIX.HANDLER} Executing tools via standard flow`);
  const stateBefore = await app.getState(config);
  const messageCountBefore = stateBefore.values.messages.length;
  const stream = await app.stream(null, config);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _event of stream) {
    /* consume */
  }

  const stateSnapshot = await app.getState(config);
  const state = stateSnapshot.values;
  const newMessages = state.messages.slice(messageCountBefore);
  const createdIds = collectCreatedIdsFromToolMessages(newMessages);
  const newLastMessage = state.messages[state.messages.length - 1];

  if (
    newLastMessage instanceof AIMessage &&
    newLastMessage.tool_calls &&
    newLastMessage.tool_calls.length > 0
  ) {
    return {
      status: 'REQUIRES_APPROVAL',
      message: newLastMessage.content as string,
      pendingToolCalls: newLastMessage.tool_calls.map((tc) => ({
        name: tc.name,
        args: tc.args as Record<string, unknown>,
        id: tc.id || '',
      })),
      ...createdIds,
    };
  }

  if (newLastMessage instanceof AIMessage) {
    return {
      status: 'COMPLETED',
      message: newLastMessage.content as string,
      pendingFieldNote: state.pendingFieldNote,
      ...createdIds,
    };
  }

  return {
    status: 'COMPLETED',
    message: FIELD_NOTE_MESSAGES.TOOL_EXECUTION_COMPLETED,
    ...createdIds,
  };
}

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
