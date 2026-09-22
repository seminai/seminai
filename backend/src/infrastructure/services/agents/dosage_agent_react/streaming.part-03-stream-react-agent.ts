import { StreamEvent, AgentStreamResponse } from './type/events';
import { DEFAULT_REACT_MODEL } from './graph/DosageReactGraph';
import { detectLanguage } from './language-detector';
import { createReactAgent } from './DosageReactAgent';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { createChatEmitter } from './socket/chat-socket-emitter';
import { agentRunRegistry } from '../AgentRunRegistry';
import { getConversationDurability } from './graph/durability-policy';
import { computeReactRuntimeBudget } from './graph/react-runtime-budget';
import { resolveToolBundle } from './graph/tool-registry';
import { cancelPendingToolCalls } from './graph/pending-tool-cancellation';
import { updateWorkingMemory } from './working-memory';
import { selectPromotedCompanyId } from './mention-promotion';
import { buildUserMessageContext } from './user-message-context-builder';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { computeAdaptiveTimeout } from './graph/runtime-limits.constant';
import { ReactStreamRuntime, StreamReactAgentOptions, streamGraphEvents } from './streaming.part-01-build-extraction-review-event';
import { completeReactStream, emitPendingUiEvents, handlePendingToolCalls } from './streaming.part-02-complete-react-stream';

/**
 * Streams the ReAct agent execution with token-by-token delivery.
 * Tracks costs, emits tool calls, and handles approval gates.
 */
export async function* streamReactAgent(
  options: StreamReactAgentOptions,
): AsyncGenerator<StreamEvent, AgentStreamResponse, unknown> {
  const {
    threadId,
    userMessage,
    userId,
    modelName = DEFAULT_REACT_MODEL,
    temperature,
    jobId,
    workspaceId,
    context,
    initialProducts,
    initialUnits,
    mentions,
    clientContext,
    toolBundle,
    domain,
    externalSignal,
  } = options;

  const responseLanguage = detectLanguage(userMessage);

  const app = await createReactAgent({
    threadId,
    modelName,
    temperature,
    userId,
    jobId,
    workspaceId,
    context,
    initialProducts,
    initialUnits,
    clientContext,
    toolBundle,
    domain,
  });

  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  const usageStartedAt = new Date();
  let tavilyCalls = 0;
  const usageLogger = LlmUsageLogger.getInstance();
  const chatEmitter = createChatEmitter(threadId);
  let streamTimeout: ReturnType<typeof setTimeout> | undefined;
  const abortController = new AbortController();
  agentRunRegistry.register(threadId, abortController);
  const onExternalAbort = () => abortController.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const baseConfig = {
      configurable: { thread_id: threadId },
      durability: getConversationDurability(),
    };
    const preStreamState = await app.getState(baseConfig);
    const taskList = (preStreamState.values.taskList ?? []) as ReadonlyArray<{ status: string }>;
    const runtimeBudget = computeReactRuntimeBudget({
      toolBundle: resolveToolBundle({ jobId, forcedBundle: toolBundle }),
      taskList,
    });
    const config = {
      ...baseConfig,
      recursionLimit: runtimeBudget.recursionLimit,
    };

    // If the graph is paused at approval_gate (pending tool_calls in last AIMessage),
    // inject synthetic cancellation ToolMessages so the new HumanMessage doesn't create
    // an invalid message sequence (AIMessage[tool_calls] → HumanMessage) for OpenAI.
    await cancelPendingToolCalls({
      app: app as unknown as import('../shared/hitl/types').HitlAgentApp,
      config,
      reason: 'Nuovo messaggio utente ricevuto durante attesa di approvazione.',
    });

    // Persist the current turn's mentions in WM so async sub-flows (e.g. the
    // ChatExtractionQueue worker) can reuse @company references without
    // requiring another agent round-trip. Always overwrite (including with []):
    // stale mentions from a previous turn must NOT leak into the next turn,
    // otherwise auto-presentation could associate a document with the wrong
    // company for users that have multiple companies.
    // Promote single-company mention to currentCompanyId so list_* tools can
    // default companyId from WM. Ambiguous (2+ company mentions) → undefined
    // and the LLM disambiguates explicitly.
    updateWorkingMemory(threadId, {
      currentMentions: mentions ? [...mentions] : [],
      currentCompanyId: selectPromotedCompanyId(mentions),
    });

    const { enrichedMessage } = await buildUserMessageContext({
      threadId,
      userMessage,
      userId,
      mentions,
      includeWorkingMemoryContext: true,
      clientContext,
    });

    const inputs = {
      messages: [new HumanMessage(enrichedMessage)],
      loopCounter: 0,
      lastToolCalls: [],
      lastToolCallRecords: [],
    };

    const adaptiveTimeoutMs = computeAdaptiveTimeout(taskList, []);
    streamTimeout = setTimeout(() => abortController.abort(), adaptiveTimeoutMs);

    const stream = (await app.stream(inputs, {
      ...config,
      streamMode: ['messages', 'updates'],
      signal: abortController.signal,
      callbacks: [usageCollector],
    })) as AsyncIterable<[string, unknown]>;

    const streamRuntime: ReactStreamRuntime = {
      tavilyCalls,
      lastAIMessageContent: '',
      lastEmittedModelKey: '',
    };
    yield* streamGraphEvents({
      stream,
      runtime: streamRuntime,
      taskList,
      warningThreshold: runtimeBudget.warningThreshold,
      usageAccumulator,
      chatEmitter,
    });
    tavilyCalls = streamRuntime.tavilyCalls;
    clearTimeout(streamTimeout);

    yield* emitPendingUiEvents(threadId, chatEmitter);

    // Get final state
    const stateSnapshot = await app.getState(config);
    const messages = stateSnapshot.values.messages;
    if (!messages || messages.length === 0) {
      yield { type: 'error', error: 'No response generated.' };
      return { status: 'ERROR', error: 'No response generated.' };
    }

    const lastMessage = messages[messages.length - 1] as AIMessage & {
      tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
    };

    const pendingResult = yield* handlePendingToolCalls({
      threadId,
      toolCalls: lastMessage?.tool_calls,
      pendingAction: stateSnapshot.values.pendingAction,
      chatEmitter,
    });
    if (pendingResult) return pendingResult;

    return yield* completeReactStream({
      messages: stateSnapshot.values.messages,
      executedTools: (stateSnapshot.values.lastToolCalls ?? []) as string[],
      fallbackContent: streamRuntime.lastAIMessageContent,
      responseLanguage,
      usageAccumulator,
      usageLogger,
      usageStartedAt,
      userId,
      jobId,
      threadId,
      modelName,
      tavilyCalls,
      chatEmitter,
    });
  } catch (error) {
    clearTimeout(streamTimeout);
    if (abortController.signal.aborted) {
      const cancelledEvent: StreamEvent = { type: 'cancelled' };
      yield cancelledEvent;
      chatEmitter?.emitStreamEvent(cancelledEvent);
      return { status: 'CANCELLED' };
    }
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
    const errorEvent: StreamEvent = {
      type: 'error',
      error: errorMessage,
    };
    yield errorEvent;
    chatEmitter?.emitStreamEvent(errorEvent);
    return {
      status: 'ERROR',
      error: errorMessage,
    };
  } finally {
    clearTimeout(streamTimeout);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
    agentRunRegistry.unregister(threadId, abortController);
  }
}
