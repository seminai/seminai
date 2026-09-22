import {
  AgentResponseStatus as MessageStatus,
  type MessageCost,
} from '../../../domain/entities/Message';
import type {
  AgentStreamResponse,
  StreamEvent,
} from '../../services/agents/dosage_agent_react/type/events';

interface ConsumeAgentStreamInput {
  readonly iterator: AsyncGenerator<StreamEvent, AgentStreamResponse, unknown>;
  readonly persistEvent: (event: StreamEvent) => void;
  readonly writeEvent: (event: StreamEvent) => void;
  readonly mapStatus: (status: AgentStreamResponse['status']) => MessageStatus;
}

export interface ConsumedAgentStream {
  readonly assistantContent: string;
  readonly finalAgentResponse: AgentStreamResponse | null;
  readonly finalCost?: MessageCost;
  readonly finalStatus: MessageStatus | null;
  readonly finalPendingToolCalls?: Array<Record<string, unknown>>;
  readonly finalError?: string;
  readonly finalMetadata?: Record<string, unknown>;
}

export async function consumeAgentStream(
  input: ConsumeAgentStreamInput,
): Promise<ConsumedAgentStream> {
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed || typeof input.iterator.return !== 'function') return;
    closed = true;
    await input.iterator.return({ status: 'CANCELLED' });
  };
  let assistantContent = '';
  let finalAgentResponse: AgentStreamResponse | null = null;
  let finalCost: MessageCost | undefined;
  let finalStatus: MessageStatus | null = null;
  let finalPendingToolCalls: Array<Record<string, unknown>> | undefined;
  let finalError: string | undefined;
  let finalMetadata: Record<string, unknown> | undefined;

  while (true) {
    const { value, done } = await input.iterator.next();
    if (done) {
      finalAgentResponse = value ?? null;
      break;
    }
    input.persistEvent(value);
    input.writeEvent(value);
    if (value.type === 'token') assistantContent += value.content ?? '';
    if (value.type === 'cancelled') {
      finalStatus = MessageStatus.CANCELLED;
      await close();
      break;
    }
    if (value.type === 'requires_approval') {
      finalStatus = MessageStatus.REQUIRES_APPROVAL;
      finalPendingToolCalls = value.toolCall ? [value.toolCall] : undefined;
      await close();
      break;
    }
    if (value.type === 'complete') {
      finalStatus = MessageStatus.COMPLETED;
      assistantContent = value.response?.message ?? assistantContent;
      finalCost = value.cost
        ? {
            inputTokens: value.cost.inputTokens,
            outputTokens: value.cost.outputTokens,
            tavilyCalls: value.cost.tavilyCalls,
            totalCostUsd: value.cost.totalCostUsd,
            costWithMarginUsd: value.cost.costWithMarginUsd,
          }
        : undefined;
      finalMetadata = value.sources ? { sources: value.sources } : undefined;
      await close();
      break;
    }
    if (value.type === 'questionnaire_presented') {
      finalMetadata = { ...(finalMetadata ?? {}), questionnaire: value.questionnaire };
    }
    if (value.type === 'extraction_review_presented' && value.extractionReview) {
      finalMetadata = {
        ...(finalMetadata ?? {}),
        extractionReviewId: value.extractionReview.reviewId,
      };
    }
    if (value.type === 'error') {
      finalStatus = MessageStatus.ERROR;
      finalError = value.error;
      await close();
      break;
    }
  }

  if (!finalStatus && finalAgentResponse) {
    finalStatus = input.mapStatus(finalAgentResponse.status);
    finalPendingToolCalls = finalAgentResponse.pendingToolCalls;
    finalError = finalAgentResponse.error;
    finalMetadata = finalAgentResponse.sources
      ? { ...(finalMetadata ?? {}), sources: finalAgentResponse.sources }
      : finalMetadata;
  }
  return {
    assistantContent,
    finalAgentResponse,
    finalCost,
    finalStatus,
    finalPendingToolCalls,
    finalError,
    finalMetadata,
  };
}
