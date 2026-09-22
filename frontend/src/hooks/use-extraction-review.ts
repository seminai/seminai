import { useMutation, useQuery } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import type { DocumentCategory } from '@/types/prisma';
import type { ExtractionReviewPayload } from '@/lib/agent-chat-events';

interface CommitReviewInput {
  readonly reviewId: string;
  readonly data: Record<string, unknown>;
}

interface CancelReviewInput {
  readonly reviewId: string;
}

export interface CommitReviewResponse {
  readonly status: string;
  readonly data: {
    readonly extractionId: string;
    readonly archiveUrl: string;
    readonly documentCategory: DocumentCategory;
    readonly companyId: string;
    readonly fileName: string;
  };
}

export function useExtractionReviewCommit() {
  return useMutation<CommitReviewResponse, Error, CommitReviewInput>({
    mutationFn: ({ reviewId, data }) =>
      customFetch<CommitReviewResponse>({
        url: `/agent-chat/pending-extraction/${reviewId}/commit`,
        method: 'POST',
        data: { data },
      }),
  });
}

export function useExtractionReviewCancel() {
  return useMutation<void, Error, CancelReviewInput>({
    mutationFn: async ({ reviewId }) => {
      await customFetch<unknown>({
        url: `/agent-chat/pending-extraction/${reviewId}/cancel`,
        method: 'POST',
      });
    },
  });
}

interface PendingExtractionResponse {
  readonly status: string;
  readonly data: ExtractionReviewPayload;
}

/**
 * Loads a pending extraction review by id so the form can be rendered
 * after a chat refresh (rehydrate flow).
 */
export function usePendingExtractionReview(reviewId: string | undefined) {
  return useQuery<ExtractionReviewPayload | null, Error>({
    queryKey: ['pending-extraction', reviewId],
    enabled: Boolean(reviewId),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      if (!reviewId) return null;
      try {
        const res = await customFetch<PendingExtractionResponse>({
          url: `/agent-chat/pending-extraction/${reviewId}`,
          method: 'GET',
        });
        return res.data;
      } catch {
        // Expired or already committed/cancelled — surfaced as null so the
        // bubble can show a closing message instead of a live form.
        return null;
      }
    },
  });
}
