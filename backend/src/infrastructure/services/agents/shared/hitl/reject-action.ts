import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import type { HitlAgentApp, HitlConfig, HitlResponse, HitlPendingToolCall } from './types';
import { cancelPendingToolCalls } from './cancel-pending-tool-calls';

type TypedToolCall = { name: string; args: Record<string, unknown>; id: string };

export interface HitlRejectOptions {
  readonly app: HitlAgentApp;
  readonly threadId: string;
  readonly config: HitlConfig;
  /** Rejection reason / feedback from the user. */
  readonly reason: string;
  /**
   * Node name used when cancelling pending tool calls.
   * Defaults to `'tools'`. Field note agent uses `'save_tools'`.
   */
  readonly cancelAsNode?: string;
  /** Transforms pending tool calls before returning them. */
  readonly formatPendingToolCalls?: (
    toolCalls: readonly TypedToolCall[],
  ) => ReadonlyArray<HitlPendingToolCall>;
}

/**
 * Generic reject action that cancels pending tool calls, injects a feedback
 * HumanMessage, and resumes the graph so the agent can propose an alternative.
 */
export async function hitlReject(options: HitlRejectOptions): Promise<HitlResponse> {
  const { app, threadId, config, reason, cancelAsNode = 'tools', formatPendingToolCalls } = options;

  try {
    // Cancel any pending tool_calls so the message sequence stays valid
    await cancelPendingToolCalls({ app, config, reason, asNode: cancelAsNode });
    const rejectionMessage = new HumanMessage(
      `L'azione precedente è stata rifiutata. Motivo: ${reason}. Per favore, proponi un approccio alternativo.`,
    );
    const stream = await app.stream({ messages: [rejectionMessage] }, config);
    await consumeStream(stream);
    const stateSnapshot = await app.getState(config);
    const allMessages: BaseMessage[] = stateSnapshot.values.messages ?? [];
    const lastAIMessage = findLastAIMessage(allMessages);
    const pendingToolCalls = extractToolCalls(lastAIMessage);
    // Agent proposed another tool call after rejection
    if (pendingToolCalls.length > 0) {
      return {
        status: 'REQUIRES_APPROVAL',
        message: lastAIMessage?.content?.toString() || "L'agente propone un'azione alternativa.",
        pendingToolCalls: formatPendingToolCalls
          ? formatPendingToolCalls(pendingToolCalls)
          : pendingToolCalls,
      };
    }
    return {
      status: 'COMPLETED',
      message:
        lastAIMessage?.content?.toString() || "Azione rifiutata. L'agente è stato informato.",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`[hitlReject] Error for thread ${threadId}:`, error);
    return { status: 'ERROR', error: `Errore nel rifiuto: ${errorMessage}` };
  }
}

// ── Internal helpers ──

function findLastAIMessage(messages: readonly BaseMessage[]): AIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] instanceof AIMessage) return messages[i] as AIMessage;
  }
  return undefined;
}

function extractToolCalls(message: AIMessage | undefined): TypedToolCall[] {
  if (!message) return [];
  const aiMsg = message as AIMessage & { tool_calls?: TypedToolCall[] };
  return aiMsg.tool_calls && aiMsg.tool_calls.length > 0 ? aiMsg.tool_calls : [];
}

async function consumeStream(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const event of stream) {
    void event;
  }
}
