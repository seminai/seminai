import { AIMessage, BaseMessage } from '@langchain/core/messages';
import type { HitlAgentApp, HitlConfig, HitlResponse, HitlPendingToolCall } from './types';
import type { RiskPolicy } from './risk-policy';

/** Default maximum auto-resume iterations within a single approval session. */
const DEFAULT_MAX_AUTO_CONTINUE = 5;

type TypedToolCall = { name: string; args: Record<string, unknown>; id: string };

export interface HitlApproveOptions {
  readonly app: HitlAgentApp;
  readonly threadId: string;
  readonly config: HitlConfig;
  /**
   * When provided, enables auto-continue: if the graph pauses again for a
   * tool type that was already approved in this session, it resumes
   * automatically. A genuinely new tool type returns REQUIRES_APPROVAL.
   */
  readonly riskPolicy?: RiskPolicy;
  /** Maximum auto-continue iterations (default 5). */
  readonly maxAutoContinue?: number;
  /** Called after each auto-continue iteration for progress reporting. */
  readonly onAutoContinue?: (iteration: number, newMessages: readonly BaseMessage[]) => void;
  /** Transforms pending tool calls before returning them (e.g. display sanitization). */
  readonly formatPendingToolCalls?: (
    toolCalls: readonly TypedToolCall[],
  ) => ReadonlyArray<HitlPendingToolCall>;
}

/**
 * Generic approve action that resumes a LangGraph agent paused at an
 * `interruptBefore` gate.
 *
 * Supports "Approval Session Auto-Continue": once the user approves a tool
 * type, subsequent pauses for the same tool type(s) are auto-resumed.
 */
export async function hitlApprove(options: HitlApproveOptions): Promise<HitlResponse> {
  const {
    app,
    threadId,
    config,
    riskPolicy,
    maxAutoContinue = DEFAULT_MAX_AUTO_CONTINUE,
    onAutoContinue,
    formatPendingToolCalls,
  } = options;

  try {
    // Phase 1: Capture the tool types the user explicitly approved
    const stateBeforeResume = await app.getState(config);
    const approvedToolNames = extractPendingToolNames(stateBeforeResume.values.messages);
    const msgCountBefore = stateBeforeResume.values.messages?.length ?? 0;
    console.log(
      `[hitlApprove] Starting approval session for thread: ${threadId}, approved tools: [${[...approvedToolNames].join(', ')}]`,
    );
    // Phase 2: Resume loop with auto-continue
    for (let iteration = 0; iteration < maxAutoContinue; iteration++) {
      const isAutoContinue = iteration > 0;
      const label = isAutoContinue ? `auto-continue #${iteration}` : 'initial resume';
      console.log(`[hitlApprove] ${label} for thread: ${threadId}`);
      const stream = await app.stream(null, config);
      await consumeStream(stream);
      const stateSnapshot = await app.getState(config);
      const allMessages: BaseMessage[] = stateSnapshot.values.messages ?? [];
      if (isAutoContinue && onAutoContinue) {
        onAutoContinue(iteration, allMessages.slice(msgCountBefore));
      }
      const lastAIMessage = findLastAIMessage(allMessages);
      const pendingToolCalls = extractToolCalls(lastAIMessage);
      // No more tool calls → completed
      if (pendingToolCalls.length === 0) {
        console.log(`[hitlApprove] Completed (${label}) for thread: ${threadId}`);
        return {
          status: 'COMPLETED',
          message: lastAIMessage?.content?.toString() || 'Azione completata con successo.',
        };
      }
      // Without a risk policy, no auto-continue — always return for approval
      if (!riskPolicy) {
        return {
          status: 'REQUIRES_APPROVAL',
          message: "L'agente richiede approvazione per un'altra azione.",
          pendingToolCalls: formatPendingToolCalls
            ? formatPendingToolCalls(pendingToolCalls)
            : pendingToolCalls,
        };
      }
      const pendingNames = pendingToolCalls.map((tc) => tc.name);
      // Check if ALL pending tool types were already approved in this session
      if (!pendingNames.every((n) => approvedToolNames.has(n))) {
        const newTypes = pendingNames.filter((n) => !approvedToolNames.has(n));
        console.log(
          `[hitlApprove] New tool type(s) [${newTypes.join(', ')}] require approval. Returning to frontend.`,
        );
        return {
          status: 'REQUIRES_APPROVAL',
          message: "Azione eseguita. L'agente richiede approvazione per un'altra azione.",
          pendingToolCalls: formatPendingToolCalls
            ? formatPendingToolCalls(pendingToolCalls)
            : pendingToolCalls,
        };
      }
      console.log(
        `[hitlApprove] Auto-continuing: tools [${pendingNames.join(', ')}] already approved.`,
      );
    }
    // Safety: max iterations reached
    console.warn(
      `[hitlApprove] Max auto-continue iterations (${maxAutoContinue}) reached for thread: ${threadId}.`,
    );
    const finalState = await app.getState(config);
    const lastMsg = findLastAIMessage(finalState.values.messages ?? []);
    return {
      status: 'COMPLETED',
      message: lastMsg?.content?.toString() || 'Operazione completata con successo.',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error(`[hitlApprove] Error for thread ${threadId}:`, error);
    return { status: 'ERROR', error: `Errore nell'approvazione: ${errorMessage}` };
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

function extractPendingToolNames(messages: readonly BaseMessage[]): ReadonlySet<string> {
  const lastAIMessage = findLastAIMessage(messages);
  return new Set(extractToolCalls(lastAIMessage).map((tc) => tc.name));
}

async function consumeStream(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const event of stream) {
    void event;
  }
}
