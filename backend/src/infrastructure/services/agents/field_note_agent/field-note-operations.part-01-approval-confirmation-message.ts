import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { type FieldNoteRunConfig } from './runtime';
import type { AgentResponse, AgentState } from './types';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { PrismaClient } from '@prisma/client';
import { saveFieldNote } from '../../tool/saveFieldNote';
import { saveStockInPurchase } from '../../tool/saveStockInPurchase';
import { saveStockInHarvest } from '../../tool/saveStockInHarvest';
import { saveStockOutSale } from '../../tool/saveStockOutSale';
import { saveStockOutTreatment } from '../../tool/saveStockOutTreatment';

export const APPROVAL_CONFIRMATION_MESSAGE =
  'Sì, confermo. Procedi con il salvataggio di tutte le note di campo proposte.';

export const IDEMPOTENT_NO_OP_MESSAGE = 'Operazione già completata o non più disponibile.';

export type PendingToolCall = {
  name: string;
  args: Record<string, unknown>;
  id: string;
};

export function extractCreatedIdsFromPayload(payload: unknown): {
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

export function collectCreatedIdsFromToolMessages(messages: readonly BaseMessage[]): {
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
export async function clearFieldNotePendingAction(
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
export async function executeBulkSaveAndFinalize(
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

export async function executeSaveToolDirect(
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
