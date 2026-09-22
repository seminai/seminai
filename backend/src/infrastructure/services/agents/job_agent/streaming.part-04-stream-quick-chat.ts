import { LangChainUsageCollector, UsageAccumulator, CostCalculator, ModelPricingRegistry } from '../../llm_costs/usage';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { createChatModel } from '../../llm-model-factory';
import type { DynamicStructuredTool } from '@langchain/core/tools';
import { createCachedBdfClient, createBdfSearchProductDosesTool, createBdfSearchProductsByAdversityTool } from '../../integrations/bdf';
import { createProposeJobModificationTool } from './tools';
import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { LlmJobType } from '@prisma/client';
import { PrismaUserRepository } from '../../../repositories/PrismaUserRepository';
import { prisma } from '../../../repositories/Prisma';
import { DeductUserCreditsUseCase } from '../../../../application/use-cases/user/DeductUserCreditsUseCase';
import { StreamEvent, StreamEventType, StreamJobVerificationOptions } from './streaming.part-01-stream-event-type';
import { buildQuickChatMessages, streamQuickModificationApproval } from './streaming.part-03-stream-quick-modification-approval';
import { getToolResultSummary, getToolThinkingMessage } from './streaming.part-05-get-tool-thinking-message';

export async function* streamQuickChat(
  options: StreamJobVerificationOptions,
): AsyncGenerator<StreamEvent, void, unknown> {
  const { input, userId, modelName, temperature } = options;

  // Initialize cost tracking
  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  const usageLogger = LlmUsageLogger.getInstance();

  // Emit thinking event
  yield {
    type: 'thinking',
    thinking: '⚡ Modalità rapida - analisi veloce...',
  };

  try {
    const { model } = createChatModel({
      modelName: modelName || 'gpt-4o-mini', // Use faster model for quick chat
      temperature: temperature ?? 0.3,
      streaming: true,
      callbacks: [usageCollector],
    });

    // Create BDF tools if credentials available
    const bdfTools: DynamicStructuredTool[] = [];
    const bdfBaseUrl = process.env.URL_SERVER_BDF;
    const bdfUsername = process.env.USERNAME_BDF;
    const bdfPassword = process.env.PASSWORD_BDF;
    if (bdfBaseUrl && bdfUsername && bdfPassword) {
      const bdfClient = createCachedBdfClient();
      bdfTools.push(
        createBdfSearchProductDosesTool(bdfClient),
        createBdfSearchProductsByAdversityTool(bdfClient),
      );
    }

    // Always include propose_job_modification tool so quick mode can propose changes
    const proposeModificationTool = createProposeJobModificationTool();
    const allQuickTools: DynamicStructuredTool[] = [
      ...bdfTools,
      proposeModificationTool,
    ];

    // Bind all tools
    const modelForChat = model.bindTools(allQuickTools);

    const messages = buildQuickChatMessages(input, bdfTools.length > 0);

    let accumulatedContent = '';

    // Stream the response
    const stream = await modelForChat.stream(messages);
    let fullMessage: AIMessageChunk | null = null;

    for await (const chunk of stream) {
      if (chunk.content) {
        const content = chunk.content.toString();
        accumulatedContent += content;
        yield {
          type: 'token',
          content: content,
        };
      }
      // Accumulate full message for tool call detection
      fullMessage = fullMessage ? (fullMessage.concat(chunk) as AIMessageChunk) : chunk;
    }

    // Handle tool calls if the model decided to use them
    if (fullMessage?.tool_calls?.length) {
      // Collect ALL propose_job_modification calls (LLM may call it once per job)
      const modificationCalls = fullMessage.tool_calls.filter(
        (tc) => tc.name === 'propose_job_modification',
      );

      if (modificationCalls.length > 0) {
        yield* streamQuickModificationApproval({
          modificationCalls,
          jobInput: input,
          usageAccumulator,
          usageLogger,
          options,
          modelName,
          userId,
        });
        return;
      }

      // Handle BDF tool calls
      const toolResultMessages: ToolMessage[] = [];

      for (const tc of fullMessage.tool_calls) {
        const tool = allQuickTools.find((t) => t.name === tc.name);
        if (!tool) continue;

        yield {
          type: 'tool_start' as StreamEventType,
          toolCall: { name: tc.name, args: tc.args as Record<string, unknown> },
          thinking: getToolThinkingMessage(tc.name, tc.args as Record<string, unknown>),
        };

        const result = await tool.invoke(tc.args);
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

        toolResultMessages.push(
          new ToolMessage({
            content: resultStr,
            tool_call_id: tc.id || `tc_${Date.now()}`,
            name: tc.name,
          }),
        );

        const resultSummary = getToolResultSummary(tc.name, resultStr);
        yield {
          type: 'tool_result' as StreamEventType,
          toolResult: {
            name: tc.name,
            result: resultStr.length > 500 ? resultStr.substring(0, 500) + '...' : resultStr,
            summary: resultSummary,
          },
          thinking: resultSummary || 'Informazioni raccolte con successo',
        };
      }

      if (toolResultMessages.length > 0) {
        // Build the AI message with tool calls for conversation continuity
        const aiMessage = new AIMessage({
          content: accumulatedContent || '',
          tool_calls: fullMessage.tool_calls.map((tc) => ({
            name: tc.name,
            args: tc.args,
            id: tc.id || `tc_${Date.now()}`,
            type: 'tool_call' as const,
          })),
        });

        // Stream follow-up response with tool results (without tools to prevent loops)
        const followUpMessages = [...messages, aiMessage, ...toolResultMessages];
        accumulatedContent = '';
        const followUpStream = await model.stream(followUpMessages);
        for await (const chunk of followUpStream) {
          if (chunk.content) {
            const content = chunk.content.toString();
            accumulatedContent += content;
            yield {
              type: 'token',
              content: content,
            };
          }
        }
      }
    }

    // Calculate costs
    const tokens = usageAccumulator.getTotals();
    const pricing = ModelPricingRegistry.getPricing(modelName || 'gpt-4o-mini');
    const cost = CostCalculator.computeCost({
      tokens,
      pricing,
      tavilyCalls: 0,
      margin: 0.2,
    });

    await usageLogger.logFromUsage(tokens, {
      userId,
      jobGroupId: options.threadId,
      jobType: LlmJobType.DOSAGE,
      model: modelName || 'gpt-4o-mini',
      metadata: {
        quickMode: true,
        jobCount: input.jobs.length,
        agentType: 'job_verification_quick',
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
          `[JOB-VERIFICATION-QUICK] Deducted ${cost.costWithMarginUsd} credits from user ${userId}`,
        );
      } catch (error) {
        console.error(`[JOB-VERIFICATION-QUICK] Failed to deduct credits:`, error);
      }
    }

    // Emit complete event
    yield {
      type: 'complete',
      reasoning: 'Parere rapido completato (senza analisi approfondita)',
      cost: {
        inputTokens: tokens.promptTokens,
        outputTokens: tokens.completionTokens,
        tavilyCalls: 0,
        totalCostUsd: cost.totalCostUsd,
        costWithMarginUsd: cost.costWithMarginUsd,
      },
      response: {
        status: 'COMPLETED',
        message: accumulatedContent,
        reasoning: 'Parere rapido (modalità quick)',
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    yield {
      type: 'error',
      error: errorMessage,
    };
  }
}

/**
 * Helper to generate thinking message for node transitions
 */
export function getNodeThinkingMessage(nodeName: string): string {
  const nodeMessages: Record<string, string> = {
    optimize_request: '📋 Sto analizzando la tua richiesta...',
    plan_tasks: '📝 Sto preparando un piano di lavoro per rispondere alla tua domanda...',
    agent: '🤔 Sto valutando il prossimo passo da compiere...',
    tools: '🔧 Sto raccogliendo le informazioni necessarie...',
    generate_answer: '✍️ Sto preparando la risposta finale...',
  };
  return nodeMessages[nodeName] || '';
}
