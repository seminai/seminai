import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import type { HitlAgentApp, HitlConfig } from './types';

export interface CancelPendingToolCallsOptions {
  readonly app: HitlAgentApp;
  readonly config: HitlConfig;
  readonly reason: string;
  /**
   * Node name used when calling `app.updateState(...)`.
   * Defaults to `'tools'` (dosage agent). Field note agent uses `'save_tools'`.
   */
  readonly asNode?: string;
}

/**
 * Cancels any pending tool calls in the last AIMessage by injecting synthetic
 * ToolMessage cancellations and updating state as if the tools node ran.
 *
 * This prevents the invalid message sequence
 * `AIMessage[tool_calls] → HumanMessage → ToolMessage` that would cause an
 * `INVALID_TOOL_RESULTS` error when OpenAI processes the history.
 *
 * @returns Number of tool calls cancelled (0 if none were pending).
 */
export async function cancelPendingToolCalls(
  options: CancelPendingToolCallsOptions,
): Promise<number> {
  const { app, config, reason, asNode = 'tools' } = options;
  const currentState = await app.getState(config);
  const currentMessages: BaseMessage[] = currentState.values.messages ?? [];
  if (currentMessages.length === 0) return 0;
  const lastMsg = currentMessages[currentMessages.length - 1] as AIMessage & {
    tool_calls?: ReadonlyArray<{ name: string; id: string; args: Record<string, unknown> }>;
  };
  if (!lastMsg?.tool_calls || lastMsg.tool_calls.length === 0) return 0;
  const cancellations = lastMsg.tool_calls
    .filter((tc) => !!tc.id)
    .map(
      (tc) =>
        new ToolMessage({
          content: JSON.stringify({ cancelled: true, reason }),
          tool_call_id: tc.id as string,
          name: tc.name,
        }),
    );
  if (cancellations.length === 0) return 0;
  const cancelledNames = lastMsg.tool_calls.map((tc) => tc.name);
  console.log(
    `[cancelPendingToolCalls] Cancelling ${cancellations.length} stale pending tool calls: [${cancelledNames.join(', ')}]`,
  );
  await app.updateState(config, { messages: cancellations }, asNode);
  return cancellations.length;
}
