import { useMutation, useQuery } from '@tanstack/react-query';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

interface RetryVectorizationResponse {
  readonly status: 'accepted';
  readonly data: { readonly rule: unknown; readonly jobId: string };
}

interface RuleChunkPreview {
  readonly content: string;
  readonly chunkIndex: number;
  readonly chunkType?: 'table' | 'text';
  readonly page?: number;
  readonly tableHeaders?: ReadonlyArray<string>;
  readonly sectionName?: string;
}

interface ChunksResponse {
  readonly status: 'success';
  readonly data: {
    readonly ruleId: string;
    readonly isVectorized: boolean;
    readonly chunks: ReadonlyArray<RuleChunkPreview>;
  };
}

async function retryRuleVectorization(ruleId: string): Promise<RetryVectorizationResponse> {
  const response = await fetch(`${BASE_URL}/rules/${ruleId}/vectorize`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to retry vectorization: ${response.status} ${text}`);
  }
  return response.json();
}

async function fetchRuleChunks(ruleId: string, limit: number): Promise<ChunksResponse['data']> {
  const response = await fetch(`${BASE_URL}/rules/${ruleId}/chunks?limit=${limit}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch chunks: ${response.status} ${text}`);
  }
  const json: ChunksResponse = await response.json();
  return json.data;
}

export function useRetryRuleVectorization() {
  return useMutation({ mutationFn: retryRuleVectorization });
}

export function useRuleChunks(ruleId: string | null, options: { readonly limit?: number; readonly enabled?: boolean } = {}) {
  const limit = options.limit ?? 5;
  return useQuery({
    queryKey: ['rule-chunks', ruleId, limit],
    queryFn: () => fetchRuleChunks(ruleId!, limit),
    enabled: Boolean(ruleId) && options.enabled !== false,
    staleTime: 60_000,
  });
}

export type { RuleChunkPreview };
