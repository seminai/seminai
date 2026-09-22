import { createAgentApp, extractSourcesFromMessages, AgentResponse } from './ChatDosageAgent';
import type { SourceCitation } from './types';
import {
  LangChainUsageCollector,
  UsageAccumulator,
  CostCalculator,
  ModelPricingRegistry,
} from '../../llm_costs/usage';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { PrismaUserRepository } from '../../../repositories/PrismaUserRepository';
import { DeductUserCreditsUseCase } from '../../../../application/use-cases/user/DeductUserCreditsUseCase';
import { ChatModel } from './graph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

/**
 * Stream event types emitted during agent execution.
 */
export type StreamEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'complete'
  | 'requires_approval'
  | 'error';

/**
 * Stream event emitted during agent execution.
 */
export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  sources?: SourceCitation[];
  cost?: {
    inputTokens: number;
    outputTokens: number;
    tavilyCalls: number;
    totalCostUsd: number;
    costWithMarginUsd: number;
  };
  error?: string;
  response?: AgentResponse;
}

/**
 * Options for streaming agent execution.
 */
export interface StreamAgentOptions {
  threadId: string;
  userMessage: string;
  userId?: string;
  modelName?: ChatModel;
  temperature?: number;
  jobId?: string;
  /** Workspace ID for workspace-level rule search */
  workspaceId?: string;
}

/**
 * Generic streaming function for agent chat.
 * Streams tokens, tool calls, and final response with cost tracking.
 *
 * @param options Streaming options
 * @returns Async generator yielding stream events
 */
export async function* streamAgentChat(
  options: StreamAgentOptions,
): AsyncGenerator<StreamEvent, AgentResponse, unknown> {
  const { threadId, userMessage, userId, modelName, temperature, jobId, workspaceId } = options;

  // Initialize agent app
  // Pass jobId to enable geographic and keyword validation of Tavily search results
  // Also initializes RAG for semantic search over job operations if jobId is provided
  const app = await createAgentApp({
    modelName: modelName || 'gpt-4o',
    temperature,
    userId,
    jobId,
    workspaceId,
    threadId,
  });

  // Initialize cost tracking
  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  let tavilyCalls = 0;
  const usageLogger = LlmUsageLogger.getInstance();

  try {
    const config = { configurable: { thread_id: threadId } };

    // Optionally prepend job context information if jobId is provided
    let messageContent = userMessage;
    if (jobId) {
      messageContent = `[Context: Current Job ID is ${jobId}. Use search_job_operations to find specific operations semantically, or get_job_details for general job info.]\n\n${userMessage}`;
    }

    const inputs = {
      messages: [new HumanMessage(messageContent)],
    };

    // Stream events from LangGraph
    const stream = await app.stream(inputs, {
      ...config,
      callbacks: [usageCollector],
    });

    let accumulatedContent = '';
    let lastAIMessageContent = '';

    for await (const event of stream) {
      // Track agent reasoning: tool calls and text tokens
      if (event.agent?.messages) {
        const lastMessage = event.agent.messages[event.agent.messages.length - 1];
        if (lastMessage instanceof AIMessage) {
          const aiMsg = lastMessage as AIMessage & {
            tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
          };
          if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
            for (const tc of aiMsg.tool_calls) {
              if (tc.name === 'tavily_scientific_search') {
                tavilyCalls++;
              }
              yield {
                type: 'tool_call',
                toolCall: { name: tc.name, args: tc.args || {}, id: tc.id },
              };
            }
          }
          if (lastMessage.content) {
            const newContent = lastMessage.content.toString();
            if (newContent.length > lastAIMessageContent.length) {
              const chunk = newContent.slice(lastAIMessageContent.length);
              accumulatedContent = newContent;
              lastAIMessageContent = newContent;
              yield { type: 'token', content: chunk };
            }
          }
        }
      }
    }

    // Get final state
    const stateSnapshot = await app.getState(config);
    const messages = stateSnapshot.values.messages;
    if (!messages || messages.length === 0) {
      yield { type: 'error', error: 'No response generated.' };
      return { status: 'ERROR', error: 'No response generated.' } as AgentResponse;
    }

    const lastMessage = messages[messages.length - 1] as AIMessage & {
      tool_calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        id: string;
      }>;
    };

    // Check if approval is needed
    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      yield {
        type: 'requires_approval',
        toolCall: {
          name: lastMessage.tool_calls[0].name,
          args: lastMessage.tool_calls[0].args,
          id: lastMessage.tool_calls[0].id,
        },
      };
      return {
        status: 'REQUIRES_APPROVAL',
        pendingToolCalls: lastMessage.tool_calls,
      } as AgentResponse;
    }

    // Extract sources
    const sources = extractSourcesFromMessages(stateSnapshot.values.messages);

    // Calculate costs
    const tokens = usageAccumulator.getTotals();
    const pricing = ModelPricingRegistry.getPricing(modelName || 'gpt-4o');
    const cost = CostCalculator.computeCost({
      tokens,
      pricing,
      tavilyCalls,
      margin: 0.2,
    });
    await usageLogger.logFromUsage(tokens, {
      userId,
      jobId,
      jobGroupId: threadId,
      jobType: LlmJobType.DOSAGE,
      model: modelName || 'gpt-4o',
      metadata: { tavilyCalls },
    });

    // Deduct credits if userId provided
    if (userId) {
      const userRepository = new PrismaUserRepository(prisma);
      const deductCreditsUseCase = new DeductUserCreditsUseCase(userRepository);
      try {
        await deductCreditsUseCase.execute({
          userId,
          amount: cost.costWithMarginUsd,
        });
        console.log(`[CHAT-AGENT] Deducted ${cost.costWithMarginUsd} credits from user ${userId}`);
      } catch (error) {
        console.error(`[CHAT-AGENT] Failed to deduct credits:`, error);
        // Don't throw - we still want to return the response
      }
    }

    // Get final AI message
    const lastAIMessage = stateSnapshot.values.messages
      .slice()
      .reverse()
      .find((msg: BaseMessage) => msg instanceof AIMessage) as AIMessage | undefined;

    // Emit final event with costs
    yield {
      type: 'complete',
      sources,
      cost: {
        inputTokens: tokens.promptTokens,
        outputTokens: tokens.completionTokens,
        tavilyCalls,
        totalCostUsd: cost.totalCostUsd,
        costWithMarginUsd: cost.costWithMarginUsd,
      },
      response: {
        status: 'COMPLETED',
        message:
          lastAIMessage?.content?.toString() || accumulatedContent || 'No response generated',
        sources,
      },
    };

    return {
      status: 'COMPLETED',
      message: lastAIMessage?.content?.toString() || accumulatedContent || 'No response generated',
      sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    yield {
      type: 'error',
      error: errorMessage,
    };
    return {
      status: 'ERROR',
      error: errorMessage,
    };
  }
}
