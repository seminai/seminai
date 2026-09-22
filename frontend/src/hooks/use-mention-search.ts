import { useQuery } from '@tanstack/react-query';
import { useDeferredValue } from 'react';
import { customFetch } from '@/lib/api-client';
import type { MentionSearchResponse, MentionSearchResultItem } from '@/types/mention';

const MENTION_SEARCH_TYPES = 'company,product,field,production_unit,stock,file';

interface UseMentionSearchResult {
  readonly results: readonly MentionSearchResultItem[];
  readonly isLoading: boolean;
}

/**
 * Debounced search hook for mention autocomplete.
 * Calls GET /mentions/search with the query string.
 * `types` restricts the searched entity types (defaults to all).
 */
export function useMentionSearch(
  query: string,
  types: string = MENTION_SEARCH_TYPES,
): UseMentionSearchResult {
  const deferredQuery = useDeferredValue(query);
  const trimmed = deferredQuery.trim();

  const { data, isLoading } = useQuery({
    queryKey: ['mentions', 'search', types, trimmed],
    queryFn: () =>
      customFetch<MentionSearchResponse>({
        url: `/mentions/search`,
        method: 'GET',
        params: { q: trimmed, types },
      }),
    enabled: trimmed.length >= 1,
    staleTime: 30_000,
  });

  return {
    results: data?.data ?? [],
    isLoading: isLoading && trimmed.length >= 1,
  };
}
