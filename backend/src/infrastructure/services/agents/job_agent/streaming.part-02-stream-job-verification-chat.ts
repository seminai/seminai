import { AgentResponse } from './types';
import { createJobVerificationAgentApp, extractSourcesFromMessages } from './ChatJobVerificationAgent';
import { LangChainUsageCollector, UsageAccumulator, CostCalculator, ModelPricingRegistry } from '../../llm_costs/usage';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { HumanMessage, AIMessage, AIMessageChunk } from '@langchain/core/messages';
import { DEFAULT_RECURSION_LIMIT } from './graph';
import { getSharedContextManager } from './context-manager';
import { LlmJobType } from '@prisma/client';
import { PrismaUserRepository } from '../../../repositories/PrismaUserRepository';
import { prisma } from '../../../repositories/Prisma';
import { DeductUserCreditsUseCase } from '../../../../application/use-cases/user/DeductUserCreditsUseCase';
import { JobGraphStreamEvent, JobStreamRuntime, StreamEvent, StreamJobVerificationOptions, handleJobGraphStreamEvent } from './streaming.part-01-stream-event-type';
import { streamQuickChat } from './streaming.part-04-stream-quick-chat';

/**
 * Streaming function for job verification agent chat.
 * Uses streamEvents() for real-time token streaming and tool visibility.
 * If deepThinking=false, uses quick chat mode without tools.
 */
export async function* streamJobVerificationChat(
  options: StreamJobVerificationOptions,
): AsyncGenerator<StreamEvent, AgentResponse, unknown> {
  const { threadId, input, userId, modelName, temperature, deepThinking = true } = options;

  // Quick chat mode - fast LLM response without tools
  if (!deepThinking) {
    yield* streamQuickChat(options);
    return {
      status: 'COMPLETED',
      message: 'Risposta rapida completata.',
    };
  }

  // Initialize agent app
  const app = createJobVerificationAgentApp({
    modelName: modelName || 'gpt-4o',
    temperature,
    userId,
  });

  // Initialize cost tracking
  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  const usageLogger = LlmUsageLogger.getInstance();

  try {
    const config = { configurable: { thread_id: threadId } };

    // Build user message with context
    let messageContent = input.message;
    if (input.metadata) {
      const metadataContext: string[] = [];
      if (input.metadata.images?.length) {
        metadataContext.push(`[Immagini allegate: ${input.metadata.images.length}]`);
      }
      if (input.metadata.links?.length) {
        metadataContext.push(`[Link allegati: ${input.metadata.links.join(', ')}]`);
      }
      if (input.metadata.pdfs?.length) {
        metadataContext.push(`[PDF allegati: ${input.metadata.pdfs.length}]`);
      }
      if (metadataContext.length > 0) {
        messageContent = `${metadataContext.join(' ')}\n\n${messageContent}`;
      }
    }

    const inputs = {
      messages: [new HumanMessage(messageContent)],
      jobs: input.jobs,
      metadata: input.metadata,
    };

    // Track state for streaming
    const runtime: JobStreamRuntime = {
      accumulatedContent: '',
      currentTasks: [],
      currentSources: [],
      currentNodeName: '',
      lastEmittedThinking: '',
      tavilyCalls: 0,
    };

    // Use streamEvents for real-time streaming
    const eventStream = app.streamEvents(inputs, {
      ...config,
      version: 'v2',
      callbacks: [usageCollector],
      recursionLimit: DEFAULT_RECURSION_LIMIT,
    });

    for await (const event of eventStream) {
      for (const emitted of handleJobGraphStreamEvent(event as JobGraphStreamEvent, runtime)) {
        yield emitted;
      }
    }

    // Get final state
    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;

    // Log context usage for monitoring
    const contextManager = getSharedContextManager();
    const finalTokenCount = contextManager.getTokenCount(state.messages);
    console.log(
      `[JOB-VERIFICATION-AGENT] Final context size: ${finalTokenCount} tokens (${state.messages.length} messages)`,
    );

    // Check if modification approval is needed
    if (state.requiresHumanInput && state.pendingAction) {
      yield {
        type: 'requires_modification_approval',
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
      return {
        status: 'REQUIRES_MODIFICATION_APPROVAL',
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
    }

    // Check if tool approval is needed
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
      tool_calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        id: string;
      }>;
    };

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
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
    }

    // Extract sources
    const sources = state.sources || extractSourcesFromMessages(state.messages);

    // Calculate costs
    const tokens = usageAccumulator.getTotals();
    const pricing = ModelPricingRegistry.getPricing(modelName || 'gpt-4o');
    const cost = CostCalculator.computeCost({
      tokens,
      pricing,
      tavilyCalls: runtime.tavilyCalls,
      margin: 0.2,
    });

    await usageLogger.logFromUsage(tokens, {
      userId,
      jobGroupId: threadId,
      jobType: LlmJobType.DOSAGE,
      model: modelName || 'gpt-4o',
      metadata: {
        tavilyCalls: runtime.tavilyCalls,
        jobCount: input.jobs.length,
        agentType: 'job_verification',
      },
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
        console.log(
          `[JOB-VERIFICATION-AGENT] Deducted ${cost.costWithMarginUsd} credits from user ${userId}`,
        );
      } catch (error) {
        console.error(`[JOB-VERIFICATION-AGENT] Failed to deduct credits:`, error);
      }
    }

    // Get final message
    const finalMessage =
      state.finalAnswer ||
      (lastMessage instanceof AIMessage ? lastMessage.content?.toString() : undefined) ||
      runtime.accumulatedContent ||
      'Elaborazione completata.';

    // Emit final event with costs
    yield {
      type: 'complete',
      sources,
      reasoning: state.reasoning,
      tasks: state.tasks,
      cost: {
        inputTokens: tokens.promptTokens,
        outputTokens: tokens.completionTokens,
        tavilyCalls: runtime.tavilyCalls,
        totalCostUsd: cost.totalCostUsd,
        costWithMarginUsd: cost.costWithMarginUsd,
      },
      response: {
        status: 'COMPLETED',
        message: finalMessage,
        reasoning: state.reasoning,
        sources,
        tasks: state.tasks,
      },
    };

    return {
      status: 'COMPLETED',
      message: finalMessage,
      reasoning: state.reasoning,
      sources,
      tasks: state.tasks,
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

/**
 * Quick chat mode - fast LLM response without tools or deep analysis.
 * Uses a single LLM call with job context for rapid user feedback.
 */
export type QuickModificationCall = NonNullable<AIMessageChunk['tool_calls']>[number];

export type ModificationArgs = {
  readonly jobId: string;
  readonly field: string;
  readonly oldValue: string;
  readonly newValue: string;
  readonly reason: string;
};
