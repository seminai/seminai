import type { ExtractionReviewPayload } from './type/events';
import { getPendingExtraction } from '../../../persistence/pending-extraction-store';
import { getExtractionFields } from '../../../../domain/extraction-schemas';
import { ReactChatModel } from './graph/DosageReactGraph';
import type { DosageAgentContext } from '../dosage_agent/context';
import type { MentionItem } from '../../../../domain/dtos/mention.dto';
import { type ToolBundle } from './graph/tool-registry';
import type { AgentPromptDomain } from './prompt/system-prompt';
import { UsageAccumulator, CostCalculator, ModelPricingRegistry, type TokenUsage } from '../../llm_costs/usage';
import { createChatEmitter } from './socket/chat-socket-emitter';
import { StreamEvent } from './type/events';
import { AIMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { RUNTIME_LIMITS } from './graph/runtime-limits.constant';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { prisma } from '../../../repositories/Prisma';
import { LlmJobType } from '@prisma/client';

export async function buildExtractionReviewEvent(
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

export interface ReactStreamRuntime {
  tavilyCalls: number;
  lastAIMessageContent: string;
  lastEmittedModelKey: string;
}

export async function* streamGraphEvents(params: {
  readonly stream: AsyncIterable<[string, unknown]>;
  readonly runtime: ReactStreamRuntime;
  readonly taskList: ReadonlyArray<{ status: string }>;
  readonly warningThreshold: number;
  readonly usageAccumulator: UsageAccumulator;
  readonly chatEmitter: ReturnType<typeof createChatEmitter>;
}): AsyncGenerator<StreamEvent, void, unknown> {
  const { stream, runtime, taskList, warningThreshold, usageAccumulator, chatEmitter } = params;
  for await (const [mode, chunk] of stream) {
    if (mode === 'messages') {
      const [messageChunk, metadata] = chunk as [AIMessageChunk, Record<string, unknown>];
      if (
        metadata.langgraph_node === 'agent' &&
        messageChunk instanceof AIMessageChunk &&
        typeof messageChunk.content === 'string' &&
        messageChunk.content
      ) {
        runtime.lastAIMessageContent += messageChunk.content;
        yield { type: 'token', content: messageChunk.content };
      }
      continue;
    }
    const event = chunk as Record<string, Record<string, unknown>>;
    if (event.agent?.selectedModel) {
      const modelInfo = event.agent.selectedModel as StreamEvent['modelInfo'];
      const modelKey = `${modelInfo?.provider}:${modelInfo?.modelName}:${modelInfo?.complexity}`;
      if (modelInfo && modelKey !== runtime.lastEmittedModelKey) {
        runtime.lastEmittedModelKey = modelKey;
        const modelEvent: StreamEvent = { type: 'model_selected', modelInfo };
        yield modelEvent;
        chatEmitter?.emitStreamEvent(modelEvent);
      }
    }
    if (event.agent?.messages) {
      const messages = event.agent.messages as BaseMessage[];
      const lastMessage = messages[messages.length - 1];
      if (lastMessage instanceof AIMessage) {
        const toolCalls = (lastMessage as AIMessage & {
          tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
        }).tool_calls;
        for (const toolCall of toolCalls ?? []) {
          if (toolCall.name === 'tavily_scientific_search') runtime.tavilyCalls += 1;
          const toolCallEvent: StreamEvent = {
            type: 'tool_call',
            toolCall: { name: toolCall.name, args: toolCall.args || {}, id: toolCall.id },
          };
          yield toolCallEvent;
          chatEmitter?.emitStreamEvent(toolCallEvent);
        }
      }
    }
    if (event.guard) {
      const loopCounter = event.guard.loopCounter as number;
      const updatedToolCalls = event.guard.lastToolCalls as string[] | undefined;
      const progressEvent: StreamEvent = {
        type: 'pipeline_progress',
        pipelineProgress: {
          currentStep: loopCounter,
          totalSteps: taskList.length > 0 ? taskList.length : loopCounter + 2,
          stepName: updatedToolCalls?.[updatedToolCalls.length - 1] ?? 'unknown',
        },
      };
      yield progressEvent;
      chatEmitter?.emitStreamEvent(progressEvent);
      if (loopCounter >= warningThreshold) {
        const warningEvent: StreamEvent = {
          type: 'loop_warning',
          content: `Attenzione: ${loopCounter} chiamate tool consecutive.`,
        };
        yield warningEvent;
        chatEmitter?.emitStreamEvent(warningEvent);
      }
    }
    const totals = usageAccumulator.getTotals();
    const totalTokens = totals.promptTokens + totals.completionTokens;
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
}

export async function resolveReactUsageCost(params: {
  readonly usageAccumulator: UsageAccumulator;
  readonly usageLogger: LlmUsageLogger;
  readonly usageStartedAt: Date;
  readonly userId?: string;
  readonly threadId: string;
  readonly modelName: ReactChatModel;
  readonly tavilyCalls: number;
}): Promise<{ readonly tokens: TokenUsage; readonly cost: ReturnType<typeof CostCalculator.computeCost> }> {
  const { usageAccumulator, usageLogger, usageStartedAt, userId, threadId, modelName, tavilyCalls } = params;
  const callbackTokens = usageAccumulator.getTotals();
  let tokens = callbackTokens;
  const pricing = ModelPricingRegistry.getPricing(modelName);
  let cost = CostCalculator.computeCost({ tokens, pricing, tavilyCalls, margin: 0.2 });
  const callbackTokenCount = callbackTokens.promptTokens + callbackTokens.completionTokens;
  if (callbackTokenCount === 0 && userId) {
    await usageLogger.flush();
    const aggregate = await prisma.llmUsage.aggregate({
      where: { userId, jobGroupId: threadId, jobType: LlmJobType.DOSAGE, createdAt: { gte: usageStartedAt } },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true, cachedTokens: true, cost: true, costClient: true },
    });
    const aggregateTokens: TokenUsage = {
      promptTokens: aggregate._sum.promptTokens ?? 0,
      completionTokens: aggregate._sum.completionTokens ?? 0,
      totalTokens: aggregate._sum.totalTokens ?? (aggregate._sum.promptTokens ?? 0) + (aggregate._sum.completionTokens ?? 0),
      cachedPromptTokens: aggregate._sum.cachedTokens ?? 0,
    };
    if (aggregateTokens.totalTokens > 0 || (aggregate._sum.costClient ?? 0) > 0) {
      const tavilyCost = CostCalculator.computeCost({
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0 },
        pricing,
        tavilyCalls,
        margin: 0.2,
      });
      tokens = aggregateTokens;
      cost = {
        ...cost,
        tokens,
        llmCostUsd: aggregate._sum.cost ?? 0,
        totalCostUsd: (aggregate._sum.cost ?? 0) + tavilyCost.tavilyCostUsd,
        costWithMarginUsd: (aggregate._sum.costClient ?? 0) + tavilyCost.costWithMarginUsd,
      };
    }
  }
  return { tokens, cost };
}
