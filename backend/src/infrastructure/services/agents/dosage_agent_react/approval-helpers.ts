import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { ChatSocketEmitter } from './socket/chat-socket-emitter';
import type { SourceCitation } from '../chat_dosage_agent/types';
import type { StreamEvent } from './type/events';

type TypedToolCall = { name: string; args: Record<string, unknown>; id: string };

export interface ForcedCompletionResponse {
  readonly status: 'COMPLETED';
  readonly message: string;
  readonly sources: SourceCitation[];
}

/**
 * Finds the last AIMessage in the message array.
 */
export function findLastAIMessage(messages: readonly BaseMessage[]): AIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] instanceof AIMessage) {
      return messages[i] as AIMessage;
    }
  }
  return undefined;
}

/**
 * Extracts tool_calls from an AIMessage, returning an empty array if none.
 */
export function extractToolCalls(message: AIMessage | undefined): TypedToolCall[] {
  if (!message) return [];
  const aiMsg = message as AIMessage & { tool_calls?: TypedToolCall[] };
  return aiMsg.tool_calls && aiMsg.tool_calls.length > 0 ? aiMsg.tool_calls : [];
}

/**
 * Extracts tool names from the pending AIMessage tool_calls.
 * Used to capture which tools the user explicitly approved.
 */
export function extractPendingToolNames(messages: readonly BaseMessage[]): ReadonlySet<string> {
  const lastAIMessage = findLastAIMessage(messages);
  const toolCalls = extractToolCalls(lastAIMessage);
  return new Set(toolCalls.map((tc) => tc.name));
}

/**
 * Collects names of tools that ran successfully (no error, no cancellation)
 * from a slice of messages.
 */
export function collectSuccessfulToolNames(messages: readonly BaseMessage[]): ReadonlySet<string> {
  return new Set(
    messages
      .filter((m): m is ToolMessage => m instanceof ToolMessage)
      .filter((m) => {
        try {
          const parsed = JSON.parse(String(m.content)) as Record<string, unknown>;
          return !parsed.error && !parsed.cancelled;
        } catch {
          return true;
        }
      })
      .map((m) => m.name as string)
      .filter(Boolean),
  );
}

/**
 * Builds a forced-completion response by finding the last non-tool-calling AIMessage.
 * Accepts a source extractor function to avoid circular imports.
 */
export function buildForcedCompletionResponse(
  allMessages: readonly BaseMessage[],
  extractSources: (msgs: BaseMessage[]) => SourceCitation[],
): ForcedCompletionResponse {
  const completionMessage = [...allMessages]
    .reverse()
    .find(
      (m): m is AIMessage =>
        m instanceof AIMessage &&
        (!('tool_calls' in m) || !(m as AIMessage & { tool_calls?: unknown[] }).tool_calls?.length),
    );
  return {
    status: 'COMPLETED',
    message: completionMessage?.content?.toString() || 'Operazione completata con successo.',
    sources: extractSources([...allMessages]),
  };
}

/**
 * Emits a socket event to notify the frontend that an auto-continue happened.
 */
export function emitAutoContinueProgress(
  emitter: ChatSocketEmitter | null,
  iteration: number,
  newMessages: readonly BaseMessage[],
): void {
  if (!emitter) return;
  const toolResults = newMessages
    .filter((m): m is ToolMessage => m instanceof ToolMessage)
    .map((m) => m.name)
    .filter(Boolean);
  if (toolResults.length === 0) return;

  const event: StreamEvent = {
    type: 'tool_call',
    content: `Auto-approvazione #${iteration}: strumenti [${toolResults.join(', ')}] eseguiti.`,
    toolCall: { name: toolResults[toolResults.length - 1]!, args: {} },
  };
  emitter.emitStreamEvent(event);
}
