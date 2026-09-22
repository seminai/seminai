import { useMemo } from 'react';
import { useGetLabelsSummary } from '@/generated/api/labels/labels';
import { parseLabelSummaryRows, type LabelSummaryRow } from '@/types/label';

interface UseLabelsSummaryResult {
  readonly labels: readonly LabelSummaryRow[];
  readonly isLoading: boolean;
  readonly isError: boolean;
}

/**
 * Loads the product-label registry summary and normalizes it into table rows.
 * Wraps the generated `useGetLabelsSummary` hook (query key `['/labels/summary']`).
 */
export function useLabelsSummary(enabled = true): UseLabelsSummaryResult {
  const query = useGetLabelsSummary({ query: { enabled } });
  const labels = useMemo(() => parseLabelSummaryRows(query.data), [query.data]);
  return { labels, isLoading: query.isLoading, isError: query.isError };
}
