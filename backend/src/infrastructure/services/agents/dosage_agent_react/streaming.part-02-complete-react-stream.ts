import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { detectLanguage } from './language-detector';
import { UsageAccumulator } from '../../llm_costs/usage';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { ReactChatModel } from './graph/DosageReactGraph';
import { createChatEmitter } from './socket/chat-socket-emitter';
import { StreamEvent, AgentStreamResponse } from './type/events';
import { extractSourcesFromMessages } from './DosageReactAgent';
import { LlmJobType } from '@prisma/client';
import { PrismaUserRepository } from '../../../repositories/PrismaUserRepository';
import { prisma } from '../../../repositories/Prisma';
import { DeductUserCreditsUseCase } from '../../../../application/use-cases/user/DeductUserCreditsUseCase';
import { guardAgainstDuplicateQuestion } from './duplicate-question-guard';
import { generateFollowUpSuggestions } from './streaming-follow-ups';
import { getWorkingMemory, updateWorkingMemory } from './working-memory';
import { buildPendingToolCallsForDisplay, buildToolCallForDisplay } from './approval-display';
import { buildExtractionReviewEvent, resolveReactUsageCost } from './streaming.part-01-build-extraction-review-event';

export async function* completeReactStream(params: {
  readonly messages: BaseMessage[];
  readonly executedTools: readonly string[];
  readonly fallbackContent: string;
  readonly responseLanguage: ReturnType<typeof detectLanguage>;
  readonly usageAccumulator: UsageAccumulator;
  readonly usageLogger: LlmUsageLogger;
  readonly usageStartedAt: Date;
  readonly userId?: string;
  readonly jobId?: string;
  readonly threadId: string;
  readonly modelName: ReactChatModel;
  readonly tavilyCalls: number;
  readonly chatEmitter: ReturnType<typeof createChatEmitter>;
}): AsyncGenerator<StreamEvent, AgentStreamResponse, unknown> {
  const { messages, executedTools, fallbackContent, responseLanguage, usageAccumulator, usageLogger, usageStartedAt, userId, jobId, threadId, modelName, tavilyCalls, chatEmitter } = params;
  const sources = extractSourcesFromMessages(messages);
  const callbackTokens = usageAccumulator.getTotals();
  const { tokens, cost } = await resolveReactUsageCost({
    usageAccumulator,
    usageLogger,
    usageStartedAt,
    userId,
    threadId,
    modelName,
    tavilyCalls,
  });
  if (callbackTokens.promptTokens + callbackTokens.completionTokens > 0) {
    await usageLogger.logFromUsage(callbackTokens, {
      userId,
      jobId,
      jobGroupId: threadId,
      jobType: LlmJobType.DOSAGE,
      model: modelName,
      metadata: { tavilyCalls, agent: 'dosage-react' },
    });
  }
  if (userId && cost.costWithMarginUsd > 0) {
    try {
      const repository = new PrismaUserRepository(prisma);
      await new DeductUserCreditsUseCase(repository).execute({
        userId,
        amount: cost.costWithMarginUsd,
      });
    } catch (error) {
      console.error('[DosageReactAgent] Failed to deduct credits:', error);
    }
  }
  const lastAiMessage = messages
    .slice()
    .reverse()
    .find((message) => message instanceof AIMessage) as AIMessage | undefined;
  const responseMessage = guardAgainstDuplicateQuestion(
    messages,
    lastAiMessage?.content?.toString() || fallbackContent || 'Nessuna risposta',
  );
  const followUps = generateFollowUpSuggestions(
    getWorkingMemory(threadId),
    [...executedTools],
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
    response: { status: 'COMPLETED', message: responseMessage, sources },
  };
  yield completeEvent;
  chatEmitter?.emitStreamEvent(completeEvent);
  return { status: 'COMPLETED', message: responseMessage, sources };
}

export async function* emitPendingUiEvents(
  threadId: string,
  chatEmitter: ReturnType<typeof createChatEmitter>,
): AsyncGenerator<StreamEvent, void, unknown> {
  const pendingQuestionnaire = getWorkingMemory(threadId).pendingQuestionnaire;
  if (pendingQuestionnaire) {
    updateWorkingMemory(threadId, { pendingQuestionnaire: undefined });
    yield { type: 'questionnaire_presented', questionnaire: pendingQuestionnaire };
  }
  const pendingReview = getWorkingMemory(threadId).pendingExtractionReview;
  if (!pendingReview) return;
  updateWorkingMemory(threadId, { pendingExtractionReview: undefined });
  const reviewPayload = await buildExtractionReviewEvent(pendingReview.reviewId);
  if (!reviewPayload) return;
  const reviewEvent: StreamEvent = {
    type: 'extraction_review_presented',
    extractionReview: reviewPayload,
  };
  yield reviewEvent;
  chatEmitter?.emitExtractionReviewPresented(reviewPayload);
}

export type PendingToolCall = { readonly name: string; readonly args: Record<string, unknown>; readonly id: string };

export async function* handlePendingToolCalls(params: {
  readonly threadId: string;
  readonly toolCalls?: PendingToolCall[];
  readonly pendingAction?: {
    readonly requiresApproval?: boolean;
    readonly riskLevel?: 'low' | 'medium' | 'high';
  };
  readonly chatEmitter: ReturnType<typeof createChatEmitter>;
}): AsyncGenerator<StreamEvent, AgentStreamResponse | null, unknown> {
  const { threadId, toolCalls, pendingAction, chatEmitter } = params;
  if (!toolCalls || toolCalls.length === 0) return null;
  if (pendingAction?.requiresApproval === true) {
    const approvalEvent: StreamEvent = {
      type: 'requires_approval',
      toolCall: buildToolCallForDisplay(threadId, toolCalls[0]),
      riskLevel: pendingAction.riskLevel,
    };
    yield approvalEvent;
    chatEmitter?.emitStreamEvent(approvalEvent);
    return {
      status: 'REQUIRES_APPROVAL',
      pendingToolCalls: buildPendingToolCallsForDisplay(threadId, toolCalls),
    };
  }
  const abortEvent: StreamEvent = {
    type: 'error',
    error: 'Turno interrotto dal rilevatore di loop. Riformula la richiesta.',
  };
  yield abortEvent;
  chatEmitter?.emitStreamEvent(abortEvent);
  return { status: 'ERROR', error: 'loop_detected_with_pending_tool_calls' };
}
