import { useMemo } from 'react';
import { useGetFieldsAvailability } from '@/generated/api/fields/fields';
import {
  mapAvailableFields,
  type AvailableField,
} from '@/components/organisms/manual-add/production-units-wizard-allocation-utils';
import { useExcludedFields } from '@/components/organisms/manual-add/use-excluded-fields';
import type { ExcludedFieldInfo } from '@/lib/field-exclusion-reason';
import type { DateRange } from '@/components/organisms/manual-add/production-units-wizard-types';

interface UseFieldAvailabilityResult {
  readonly isFetching: boolean;
  readonly refetch: () => void;
  readonly availableFields: readonly AvailableField[];
  readonly availableByFieldId: ReadonlyMap<string, AvailableField>;
  readonly excludedFields: readonly ExcludedFieldInfo[];
}

/** Availability search for the production-units wizard: available fields plus the excluded ones with reasons. */
export function useFieldAvailability(
  companyId: string,
  dateRange: DateRange,
  hasSearched: boolean,
): UseFieldAvailabilityResult {
  const query = useGetFieldsAvailability(
    hasSearched && dateRange.start && dateRange.end
      ? { startAt: dateRange.start, endAt: dateRange.end }
      : undefined,
    { query: { enabled: hasSearched && Boolean(dateRange.start && dateRange.end) } },
  );

  const availableFields = useMemo(
    () => mapAvailableFields(query.data?.data, companyId),
    [query.data?.data, companyId],
  );

  const availableByFieldId = useMemo(
    () => new Map(availableFields.map((field) => [field.fieldId, field])),
    [availableFields],
  );

  const excludedFields = useExcludedFields({
    companyId,
    dateRange,
    hasSearched,
    isAvailabilityFetching: query.isFetching,
    isAvailabilitySuccess: query.isSuccess,
    availableFieldIds: availableByFieldId,
  });

  return {
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
    availableFields,
    availableByFieldId,
    excludedFields,
  };
}
