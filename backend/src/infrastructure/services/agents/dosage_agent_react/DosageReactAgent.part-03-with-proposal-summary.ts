import { buildProposalSummary } from './proposal-summary';
import { createChatEmitter } from './socket/chat-socket-emitter';
import { getApprovalDurability, getConversationDurability } from './graph/durability-policy';
import { hitlApprove } from '../shared/hitl/approve-action';
import { dosageRiskPolicy } from './graph/risk-classifier';
import { emitAutoContinueProgress } from './approval-helpers';
import { buildPendingToolCallsForDisplay } from './approval-display';
import { forkBeforeGuard } from './graph/fork-at-rejection';
import { AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { hitlReject } from '../shared/hitl/reject-action';
import { DosageReactState } from './type/state';
import { clearWorkingMemory } from './working-memory';
import { SourceCitation } from '../chat_dosage_agent/types';
import { AgentApp, AgentResponse, agentAppCache, buildAgentRunConfig, clearPendingActionState, consumeStream } from './DosageReactAgent.part-01-agent-response-status';

/**
 * Adds a `proposalSummary` to a response that already carries `pendingToolCalls`,
 * inferring the target tool from the first pending call. No-op for other statuses.
 */
export function withProposalSummary(threadId: string, response: AgentResponse): AgentResponse {
  if (response.status !== 'REQUIRES_APPROVAL') return response;
  const firstToolName = response.pendingToolCalls?.[0]?.name;
  if (!firstToolName) return response;
  const summary = buildProposalSummary(threadId, firstToolName);
  if (!summary) return response;
  return { ...response, proposalSummary: summary };
}

// ── Approval Handling ──

/**
 * Approves the pending destructive action and resumes execution.
 * Delegates to the shared HITL approve function with dosage-specific configuration:
 * risk policy for auto-continue and socket emitter for progress.
 */
export async function approveAction(app: AgentApp, threadId: string): Promise<AgentResponse> {
  const chatEmitter = createChatEmitter(threadId);
  const config = await buildAgentRunConfig(app, threadId, getApprovalDurability());
  const result = await hitlApprove({
    app: app as unknown as import('../shared/hitl/types').HitlAgentApp,
    threadId,
    config,
    riskPolicy: dosageRiskPolicy,
    onAutoContinue: (iteration, msgs) => emitAutoContinueProgress(chatEmitter, iteration, msgs),
    formatPendingToolCalls: (toolCalls) =>
      buildPendingToolCallsForDisplay(
        threadId,
        toolCalls as Array<{ name: string; args: Record<string, unknown>; id: string }>,
      ),
  });
  // Enrich completed responses with source citations
  if (result.status === 'COMPLETED') {
    const stateConfig = { configurable: { thread_id: threadId } };
    await clearPendingActionState(app, stateConfig);
    const stateSnapshot = await app.getState(stateConfig);
    const sources = extractSourcesFromMessages(stateSnapshot.values.messages);
    return { ...result, sources, pendingToolCalls: undefined };
  }
  return withProposalSummary(threadId, {
    ...result,
    pendingToolCalls: result.pendingToolCalls as AgentResponse['pendingToolCalls'],
  });
}

/**
 * Rejects the pending action and provides feedback to the agent.
 * Attempts a fork-based rejection (time-travel to pre-guard checkpoint) first.
 * Falls back to shared HITL reject (forward-cancel) if no suitable checkpoint is found.
 */
export async function rejectAction(
  app: AgentApp,
  threadId: string,
  reason: string,
): Promise<AgentResponse> {
  try {
    const config = await buildAgentRunConfig(app, threadId, getConversationDurability());
    const forkResult = await forkBeforeGuard({ app, threadId, rejectionReason: reason });
    if (forkResult) {
      console.log(
        `[rejectAction] Fork succeeded from checkpoint ${forkResult.sourceCheckpointId}. Resuming.`,
      );
      const forkConfig = {
        ...forkResult.forkConfig,
        configurable: {
          ...forkResult.forkConfig.configurable,
          thread_id: threadId,
        },
        recursionLimit: config.recursionLimit,
        durability: getConversationDurability(),
      };
      const stream = await app.stream(null, forkConfig);
      await consumeStream(stream);
      await clearPendingActionState(app, forkConfig);
      const stateSnapshot = await app.getState(forkConfig);
      const lastAIMessage = stateSnapshot.values.messages
        .slice()
        .reverse()
        .find((msg) => msg instanceof AIMessage) as AIMessage | undefined;
      const sources = extractSourcesFromMessages(stateSnapshot.values.messages);
      return {
        status: 'COMPLETED',
        message:
          lastAIMessage?.content?.toString() || "Azione rifiutata. L'agente è stato informato.",
        sources,
      };
    }
    // Fallback: shared HITL reject (forward-cancel approach)
    console.log(
      `[rejectAction] Fork failed for thread ${threadId}. Using forward-cancel fallback.`,
    );
    const result = await hitlReject({
      app: app as unknown as import('../shared/hitl/types').HitlAgentApp,
      threadId,
      config,
      reason,
    });
    // Enrich with source citations
    if (result.status === 'COMPLETED') {
      await clearPendingActionState(app, config);
      const stateSnapshot = await app.getState(config);
      const sources = extractSourcesFromMessages(stateSnapshot.values.messages);
      return { ...result, sources, pendingToolCalls: undefined };
    }
    return withProposalSummary(threadId, {
      ...result,
      pendingToolCalls: result.pendingToolCalls as AgentResponse['pendingToolCalls'],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
    return {
      status: 'ERROR',
      error: `Errore nel rifiuto: ${errorMessage}`,
    };
  }
}

// ── State Access ──

/**
 * Gets the current conversation state for a thread.
 */
export async function getAgentState(app: AgentApp, threadId: string): Promise<DosageReactState> {
  const config = { configurable: { thread_id: threadId } };
  const stateSnapshot = await app.getState(config);
  return stateSnapshot.values;
}

/**
 * Clears working memory, evicts the cached AgentApp, and resets the thread state.
 */
export function resetThread(threadId: string): void {
  clearWorkingMemory(threadId);
  agentAppCache.delete(threadId);
}

// ── Source Extraction ──

/**
 * Extracts source citations from tool messages.
 */
export function extractSourcesFromMessages(messages: BaseMessage[]): SourceCitation[] {
  const sources: SourceCitation[] = [];

  for (const message of messages) {
    if (message instanceof ToolMessage && message.name === 'tavily_scientific_search') {
      const content = message.content.toString();
      const sourceRegex =
        /\[SOURCE_(\d+)\]\s*Title:\s*(.+?)\s*URL:\s*(.+?)\s*Content:\s*(.+?)\s*Fragment:\s*(.+?)(?=\n---|\n\[SOURCE_|$)/gs;
      let match;

      while ((match = sourceRegex.exec(content)) !== null) {
        const [, , title, url, , fragment] = match;
        if (title && url && fragment) {
          sources.push({
            title: title.trim(),
            url: url.trim(),
            fragment: fragment.trim(),
          });
        }
      }
    }
  }

  return sources;
}
