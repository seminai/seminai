import { createReactAgent, extractSourcesFromMessages } from './DosageReactAgent';
import {
  LangChainUsageCollector,
  UsageAccumulator,
  CostCalculator,
  ModelPricingRegistry,
  type TokenUsage,
} from '../../llm_costs/usage';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { PrismaUserRepository } from '../../../repositories/PrismaUserRepository';
import { DeductUserCreditsUseCase } from '../../../../application/use-cases/user/DeductUserCreditsUseCase';
import { DEFAULT_REACT_MODEL, ReactChatModel } from './graph/DosageReactGraph';
import { HumanMessage, AIMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { StreamEvent, AgentStreamResponse } from './type/events';
import type { DosageAgentContext } from '../dosage_agent/context';
import type { MentionItem } from '../../../../domain/dtos/mention.dto';
import { getWorkingMemory, updateWorkingMemory } from './working-memory';
import { selectPromotedCompanyId } from './mention-promotion';
import { buildUserMessageContext } from './user-message-context-builder';
import { createChatEmitter } from './socket/chat-socket-emitter';
import { agentRunRegistry } from '../AgentRunRegistry';
import { RUNTIME_LIMITS, computeAdaptiveTimeout } from './graph/runtime-limits.constant';
import { computeReactRuntimeBudget } from './graph/react-runtime-budget';
import { resolveToolBundle, type ToolBundle } from './graph/tool-registry';
import type { AgentPromptDomain } from './prompt/system-prompt';
import { cancelPendingToolCalls } from './graph/pending-tool-cancellation';
import { getConversationDurability } from './graph/durability-policy';
import { buildPendingToolCallsForDisplay, buildToolCallForDisplay } from './approval-display';
import { generateFollowUpSuggestions } from './streaming-follow-ups';
import { detectLanguage } from './language-detector';
import { getPendingExtraction } from '../../../persistence/pending-extraction-store';
import { getExtractionFields } from '../../../../domain/extraction-schemas';
import type { ExtractionReviewPayload } from './type/events';
import { guardAgainstDuplicateQuestion } from './duplicate-question-guard';

async function buildExtractionReviewEvent(
  reviewId: string,
): Promise<ExtractionReviewPayload | null> {
  const record = await getPendingExtraction(reviewId);
  if (!record) return null;
  return {
    reviewId: record.reviewId,
    category: record.category,
    companyId: record.companyId,
    fileName: record.fileName,
    fileUrl: record.fileUrl,
    fields: getExtractionFields(record.category),
    data: record.data,
  };
}

/**
 * Options for streaming ReAct agent execution.
 */
export interface StreamReactAgentOptions {
  threadId: string;
  userMessage: string;
  userId?: string;
  modelName?: ReactChatModel;
  temperature?: number;
  jobId?: string;
  workspaceId?: string;
  context?: DosageAgentContext;
  /** Initial products to load into working memory */
  initialProducts?: unknown[];
  /** Initial production units to load into working memory */
  initialUnits?: unknown[];
  /** Structured @mentions from the chat UI to resolve into context */
  mentions?: readonly MentionItem[];
  /**
   * Client-driven context payload (e.g. form snapshot from an embedded chat).
   * Plumbed through from the request so downstream consumers can read it.
   */
  clientContext?: Record<string, unknown>;
  /** Explicit tool-bundle override (e.g. 'MANUFACTURING'). Forwarded to createReactAgent. */
  toolBundle?: ToolBundle;
  /** Agent domain. MANUFACTURING selects the manufacturing persona + tool set. */
  domain?: AgentPromptDomain;
  /** External abort signal: when aborted, the agent run is cancelled. */
  externalSignal?: AbortSignal;
}

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

    let lastAIMessageContent = '';
    let lastEmittedModelKey = '';

    for await (const [mode, chunk] of stream) {
      // ── LLM token-by-token via "messages" mode ──
      if (mode === 'messages') {
        const [messageChunk, metadata] = chunk as [AIMessageChunk, Record<string, unknown>];
        // Only emit text tokens from the agent node; skip tool_call_chunks
        if (
          metadata.langgraph_node === 'agent' &&
          messageChunk instanceof AIMessageChunk &&
          typeof messageChunk.content === 'string' &&
          messageChunk.content
        ) {
          lastAIMessageContent += messageChunk.content;
          yield { type: 'token' as const, content: messageChunk.content };
        }
        continue;
      }

      // ── Node completion events via "updates" mode ──
      const event = chunk as Record<string, Record<string, unknown>>;

      // Track agent messages (tool calls only — text tokens come from "messages" mode)
      if (event.agent?.selectedModel) {
        const modelInfo = event.agent.selectedModel as StreamEvent['modelInfo'];
        const modelKey = `${modelInfo?.provider}:${modelInfo?.modelName}:${modelInfo?.complexity}`;
        if (modelInfo && modelKey !== lastEmittedModelKey) {
          lastEmittedModelKey = modelKey;
          const modelEvent: StreamEvent = {
            type: 'model_selected',
            modelInfo,
          };
          yield modelEvent;
          chatEmitter?.emitStreamEvent(modelEvent);
        }
      }
      if (event.agent?.messages) {
        const messages = event.agent.messages as BaseMessage[];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage instanceof AIMessage) {
          const aiMsg = lastMessage as AIMessage & {
            tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
          };
          if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
            for (const toolCall of aiMsg.tool_calls) {
              if (toolCall.name === 'tavily_scientific_search') {
                tavilyCalls++;
              }
              const toolCallEvent: StreamEvent = {
                type: 'tool_call',
                toolCall: {
                  name: toolCall.name,
                  args: toolCall.args || {},
                  id: toolCall.id,
                },
              };
              yield toolCallEvent;
              chatEmitter?.emitStreamEvent(toolCallEvent);
            }
          }
        }
      }

      // Track guard/loop events + pipeline progress
      if (event.guard) {
        const loopCounter = event.guard.loopCounter as number;
        const updatedToolCalls = event.guard.lastToolCalls as string[] | undefined;
        const currentToolName = updatedToolCalls?.[updatedToolCalls.length - 1] ?? 'unknown';
        const totalPendingSteps = taskList.length > 0 ? taskList.length : loopCounter + 2;
        const progressEvent: StreamEvent = {
          type: 'pipeline_progress',
          pipelineProgress: {
            currentStep: loopCounter,
            totalSteps: totalPendingSteps,
            stepName: currentToolName,
          },
        };
        yield progressEvent;
        chatEmitter?.emitStreamEvent(progressEvent);
        if (loopCounter >= runtimeBudget.warningThreshold) {
          const loopEvent: StreamEvent = {
            type: 'loop_warning',
            content: `Attenzione: ${loopCounter} chiamate tool consecutive.`,
          };
          yield loopEvent;
          chatEmitter?.emitStreamEvent(loopEvent);
        }
      }

      // Token budget guard: abort early if we've exceeded the per-message limit
      const currentTokens = usageAccumulator.getTotals();
      const totalTokens = currentTokens.promptTokens + currentTokens.completionTokens;
      if (totalTokens > RUNTIME_LIMITS.MAX_TOKENS_PER_MESSAGE) {
        const budgetEvent: StreamEvent = {
          type: 'error',
          error: `Token budget superato (${totalTokens} > ${RUNTIME_LIMITS.MAX_TOKENS_PER_MESSAGE}). Turno interrotto.`,
        };
        yield budgetEvent;
        chatEmitter?.emitStreamEvent(budgetEvent);
        break;
      }
    }
    clearTimeout(streamTimeout);

    // Check if a questionnaire was generated during this turn.
    // Capture to local variable before clearing to avoid concurrent-request races.
    const pendingQuestionnaire = getWorkingMemory(threadId).pendingQuestionnaire;
    if (pendingQuestionnaire) {
      updateWorkingMemory(threadId, { pendingQuestionnaire: undefined });
      yield {
        type: 'questionnaire_presented' as const,
        questionnaire: pendingQuestionnaire,
      };
    }

    // Check if an extraction review form was generated during this turn (Fase 3).
    const pendingReview = getWorkingMemory(threadId).pendingExtractionReview;
    if (pendingReview) {
      updateWorkingMemory(threadId, { pendingExtractionReview: undefined });
      const reviewPayload = await buildExtractionReviewEvent(pendingReview.reviewId);
      if (reviewPayload) {
        const reviewEvent: StreamEvent = {
          type: 'extraction_review_presented' as const,
          extractionReview: reviewPayload,
        };
        yield reviewEvent;
        chatEmitter?.emitExtractionReviewPresented(reviewPayload);
      }
    }

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

    // Check if approval is needed.
    // The graph leaves tool_calls on the last AIMessage in two cases:
    //   (a) it paused at `approval_gate` because the tool genuinely requires
    //       human approval (pendingAction.requiresApproval === true)
    //   (b) the loop detector forced an END before tools could execute
    // Only (a) should surface an Approve/Reject UI. In case (b) the tool would
    // have been auto-approved; treating it as REQUIRES_APPROVAL produced
    // orphan "RISCHIO MEDIO" prompts the user could not dismiss.
    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      const pendingAction = stateSnapshot.values.pendingAction;
      if (pendingAction?.requiresApproval === true) {
        const displayToolCalls = buildPendingToolCallsForDisplay(threadId, lastMessage.tool_calls);
        const approvalEvent: StreamEvent = {
          type: 'requires_approval',
          toolCall: buildToolCallForDisplay(threadId, lastMessage.tool_calls[0]),
          riskLevel: pendingAction?.riskLevel,
        };
        yield approvalEvent;
        chatEmitter?.emitStreamEvent(approvalEvent);
        return {
          status: 'REQUIRES_APPROVAL',
          pendingToolCalls: displayToolCalls,
        };
      }

      const abortEvent: StreamEvent = {
        type: 'error',
        error: 'Turno interrotto dal rilevatore di loop. Riformula la richiesta.',
      };
      yield abortEvent;
      chatEmitter?.emitStreamEvent(abortEvent);
      return {
        status: 'ERROR',
        error: 'loop_detected_with_pending_tool_calls',
      };
    }

    // Extract sources
    const sources = extractSourcesFromMessages(stateSnapshot.values.messages);

    // Calculate costs. In LangGraph streaming, the outer callback can miss
    // token usage while the agent node still persists it per LLM call. Fall
    // back to the records written for this thread/turn so the final event and
    // credit deduction reflect real usage instead of a zero-cost placeholder.
    const callbackTokens = usageAccumulator.getTotals();
    let tokens = callbackTokens;
    const pricing = ModelPricingRegistry.getPricing(modelName);
    let cost = CostCalculator.computeCost({
      tokens,
      pricing,
      tavilyCalls,
      margin: 0.2,
    });
    const callbackTokenCount = callbackTokens.promptTokens + callbackTokens.completionTokens;

    if (callbackTokenCount === 0 && userId) {
      await usageLogger.flush();
      const aggregate = await prisma.llmUsage.aggregate({
        where: {
          userId,
          jobGroupId: threadId,
          jobType: LlmJobType.DOSAGE,
          createdAt: { gte: usageStartedAt },
        },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          cachedTokens: true,
          cost: true,
          costClient: true,
        },
      });
      const aggregateTokens: TokenUsage = {
        promptTokens: aggregate._sum.promptTokens ?? 0,
        completionTokens: aggregate._sum.completionTokens ?? 0,
        totalTokens:
          aggregate._sum.totalTokens ??
          (aggregate._sum.promptTokens ?? 0) + (aggregate._sum.completionTokens ?? 0),
        cachedPromptTokens: aggregate._sum.cachedTokens ?? 0,
      };
      const aggregateRawCost = aggregate._sum.cost ?? 0;
      const aggregateClientCost = aggregate._sum.costClient ?? 0;
      if (aggregateTokens.totalTokens > 0 || aggregateClientCost > 0) {
        const tavilyOnlyCost = CostCalculator.computeCost({
          tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0 },
          pricing,
          tavilyCalls,
          margin: 0.2,
        });
        tokens = aggregateTokens;
        cost = {
          ...cost,
          tokens,
          llmCostUsd: aggregateRawCost,
          totalCostUsd: aggregateRawCost + tavilyOnlyCost.tavilyCostUsd,
          costWithMarginUsd: aggregateClientCost + tavilyOnlyCost.costWithMarginUsd,
        };
      }
    }

    if (callbackTokenCount > 0) {
      await usageLogger.logFromUsage(callbackTokens, {
        userId,
        jobId,
        jobGroupId: threadId,
        jobType: LlmJobType.DOSAGE,
        model: modelName,
        metadata: { tavilyCalls, agent: 'dosage-react' },
      });
    }

    // Deduct credits
    if (userId && cost.costWithMarginUsd > 0) {
      const userRepository = new PrismaUserRepository(prisma);
      const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
      try {
        await deductCreditsUseCase.execute({
          userId,
          amount: cost.costWithMarginUsd,
        });
      } catch (error) {
        console.error(`[DosageReactAgent] Failed to deduct credits:`, error);
      }
    }

    const lastAIMessage = stateSnapshot.values.messages
      .slice()
      .reverse()
      .find((msg: BaseMessage) => msg instanceof AIMessage) as AIMessage | undefined;
    const responseMessage = guardAgainstDuplicateQuestion(
      stateSnapshot.values.messages,
      lastAIMessage?.content?.toString() || lastAIMessageContent || 'Nessuna risposta',
    );

    // Generate follow-up suggestions before the terminal complete event. Some
    // HTTP consumers intentionally stop reading as soon as they receive
    // `complete`, so all optional post-run events must be emitted first.
    const currentWorkingMemory = getWorkingMemory(threadId);
    const executedTools = (stateSnapshot.values.lastToolCalls ?? []) as string[];
    const followUps = generateFollowUpSuggestions(
      currentWorkingMemory,
      executedTools,
      responseLanguage,
    );
    if (followUps.length > 0) {
      const followUpEvent: StreamEvent = {
        type: 'follow_up_suggestions',
        followUpSuggestions: followUps,
      };
      yield followUpEvent;
      chatEmitter?.emitStreamEvent(followUpEvent);
    }

    const completeEvent: StreamEvent = {
      type: 'complete',
      sources,
      cost: {
        inputTokens: tokens.promptTokens,
        outputTokens: tokens.completionTokens,
        tavilyCalls,
        totalCostUsd: cost.totalCostUsd,
        costWithMarginUsd: cost.costWithMarginUsd,
        provider: 'openai',
        modelName,
      },
      response: {
        status: 'COMPLETED',
        message: responseMessage,
        sources,
      },
    };
    yield completeEvent;
    chatEmitter?.emitStreamEvent(completeEvent);

    return {
      status: 'COMPLETED',
      message: responseMessage,
      sources,
    };
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
