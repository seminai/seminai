import { useMemo } from 'react';
import { useCompanyFields } from '@/components/organisms/manual-add/use-company-fields';
import {
  getFieldExclusionReason,
  type ExcludedFieldInfo,
} from '@/lib/field-exclusion-reason';
import type { DateRange } from '@/components/organisms/manual-add/production-units-wizard-types';

interface UseExcludedFieldsParams {
  readonly companyId: string;
  readonly dateRange: DateRange;
  readonly hasSearched: boolean;
  readonly isAvailabilityFetching: boolean;
  readonly isAvailabilitySuccess: boolean;
  readonly availableFieldIds: ReadonlySet<string> | ReadonlyMap<string, unknown>;
}

/**
 * Company fields missing from the availability response, each with the
 * mirrored backend exclusion reason. Empty until a search completed
 * successfully — on error/paused/never-fetched availability we must not
 * fabricate reasons.
 */
export function useExcludedFields({
  companyId,
  dateRange,
  hasSearched,
  isAvailabilityFetching,
  isAvailabilitySuccess,
  availableFieldIds,
}: UseExcludedFieldsParams): readonly ExcludedFieldInfo[] {
  const { fieldOptions: companyFields } = useCompanyFields(hasSearched ? companyId : '');
  return useMemo(() => {
    if (!hasSearched || isAvailabilityFetching || !isAvailabilitySuccess) return [];
    return companyFields
      .filter((field) => !availableFieldIds.has(field.id))
      .map((field) => ({
        id: field.id,
        name: field.name,
        reason: getFieldExclusionReason(field, dateRange),
      }));
  }, [
    availableFieldIds,
    companyFields,
    dateRange,
    hasSearched,
    isAvailabilityFetching,
    isAvailabilitySuccess,
  ]);
}
