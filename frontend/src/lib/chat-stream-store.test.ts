import { describe, expect, it } from 'vitest';
import { clearExtractionReviewForContinuation } from './chat-stream-store';
import type { TransientAssistantMessage } from '@/types/chat-stream';

function createAssistant(
  overrides: Partial<TransientAssistantMessage> = {},
): TransientAssistantMessage {
  return {
    id: 'assistant-1',
    createdAtIso: '2026-06-06T12:00:00.000Z',
    status: 'requires_approval',
    content: 'Approve the treatment plan.',
    toolCalls: [],
    pipelineProgress: null,
    errorMessage: null,
    pendingToolCalls: [],
    extractionReview: null,
    ...overrides,
  };
}

describe('clearExtractionReviewForContinuation', () => {
  it('removes stale extraction review before continuing an unrelated approval flow', () => {
    const assistant = createAssistant({
      extractionReview: {
        status: 'saved',
        payload: {
          reviewId: 'review-1',
          category: 'FATTURA',
          companyId: 'company-1',
          fileName: 'invoice.pdf',
          fields: [],
          data: {},
        },
      },
    });

    const actualResult = clearExtractionReviewForContinuation(assistant);

    expect(actualResult.extractionReview).toBeNull();
    expect(actualResult.content).toBe(assistant.content);
  });

  it('keeps assistant unchanged when no extraction review is attached', () => {
    const assistant = createAssistant();

    const actualResult = clearExtractionReviewForContinuation(assistant);

    expect(actualResult).toBe(assistant);
  });
});
