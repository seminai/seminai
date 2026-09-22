import { useEffect } from 'react';
import type {
  ExtractionPrefillStatus,
  UseExtractionToFormValuesResult,
} from '@/hooks/use-extraction-to-form-values';
import type { ProductionUnitDraft } from '@/components/organisms/manual-add/production-units-wizard-types';

interface UseApplyPrefillDraftsParams {
  readonly hasPrefill: boolean;
  readonly hasApplied: boolean;
  readonly prefillResult: UseExtractionToFormValuesResult;
  readonly onApply: (drafts: ProductionUnitDraft[]) => void;
}

/**
 * Applies prefill drafts to the wizard exactly once, when extractions land
 * in the `ready` status. Subsequent re-renders are no-ops thanks to the
 * `hasApplied` guard, so the user is free to edit/remove drafts afterwards
 * without the prefill rewriting their changes.
 */
export function useApplyPrefillDrafts({
  hasPrefill,
  hasApplied,
  prefillResult,
  onApply,
}: UseApplyPrefillDraftsParams): void {
  useEffect(() => {
    if (!hasPrefill || hasApplied) return;
    if (prefillResult.status !== ('ready' satisfies ExtractionPrefillStatus)) return;
    onApply(prefillResult.drafts.map((draft) => ({ ...draft })));
  }, [hasPrefill, hasApplied, prefillResult.status, prefillResult.drafts, onApply]);
}
