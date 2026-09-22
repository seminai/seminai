import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { type FieldNoteRunConfig } from './runtime';
import { PrismaClient } from '@prisma/client';
import type { AgentResponse } from './types';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { PendingToolCall, collectCreatedIdsFromToolMessages, executeBulkSaveAndFinalize, executeSaveToolDirect, extractCreatedIdsFromPayload } from './field-note-operations.part-01-approval-confirmation-message';

export async function executeSaveToolsDirectAndFinalize(
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
export async function handlePendingToolCalls(
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
