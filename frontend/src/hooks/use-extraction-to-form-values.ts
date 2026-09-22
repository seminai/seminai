import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import { extractionKeys } from '@/hooks/use-extractions';
import { useCompanyFields } from '@/components/organisms/manual-add/use-company-fields';
import { matchFieldByName } from '@/utils/match-field-by-name';
import {
  createEmptyDraft,
  type FieldAllocation,
  type ProductionUnitDraft,
} from '@/components/organisms/manual-add/production-units-wizard-types';
import type {
  FileExtractionResponse,
  ProductionUnitPreview,
} from '@/types/extraction';
import type { FileExtractionStatus } from '@/types/prisma';

interface ApiDetailResponse {
  readonly status: string;
  readonly data: { readonly extraction: FileExtractionResponse };
}

export type ExtractionPrefillStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'wrong-category'
  | 'error';

export interface PendingExtractionInfo {
  readonly id: string;
  readonly fileName: string | undefined;
  readonly status: FileExtractionStatus | 'UNKNOWN';
}

export interface UseExtractionToFormValuesResult {
  readonly status: ExtractionPrefillStatus;
  readonly drafts: readonly ProductionUnitDraft[];
  readonly pending: readonly PendingExtractionInfo[];
  readonly errors: readonly string[];
}

const POLL_INTERVAL_MS = 3000;
const COMPLETED_STATUSES: ReadonlySet<FileExtractionStatus> = new Set([
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'ERROR',
]);

/**
 * Fetches a batch of extractions, polls each until the BE finishes processing,
 * and maps the resulting `ProductionUnitPreview[]` payloads to draft entries
 * compatible with the production-units wizard. Field allocations resolve to a
 * concrete `fieldId` when the BE provided one or when a case-insensitive name
 * match against the company's fields succeeds.
 */
export function useExtractionToFormValues(
  extractionIds: readonly string[] | undefined,
  companyId: string,
): UseExtractionToFormValuesResult {
  const { fieldOptions } = useCompanyFields(companyId);
  const queries = useQueries({
    queries: (extractionIds ?? []).map((id) => ({
      queryKey: extractionKeys.detail(id),
      queryFn: () =>
        customFetch<ApiDetailResponse>({
          url: `/extractions/${id}`,
          method: 'GET',
        }).then((response) => response.data.extraction),
      refetchInterval: (query: { state: { data?: FileExtractionResponse } }) => {
        const data = query.state.data;
        if (!data) return POLL_INTERVAL_MS;
        return COMPLETED_STATUSES.has(data.status) ? false : POLL_INTERVAL_MS;
      },
    })),
  });

  return useMemo(() => {
    if (!extractionIds || extractionIds.length === 0) {
      return { status: 'idle', drafts: [], pending: [], errors: [] } as const;
    }

    const pending: PendingExtractionInfo[] = [];
    const errors: string[] = [];
    const drafts: ProductionUnitDraft[] = [];

    queries.forEach((query, index) => {
      const id = extractionIds[index];
      const data = query.data as FileExtractionResponse | undefined;
      if (!data) {
        pending.push({ id, fileName: undefined, status: 'UNKNOWN' });
        return;
      }
      if (!COMPLETED_STATUSES.has(data.status)) {
        pending.push({ id, fileName: data.fileName, status: data.status });
        return;
      }
      if (data.status === 'ERROR') {
        errors.push(data.fileName ?? id);
        return;
      }
      const previews = extractProductionUnitPreviews(data);
      previews.forEach((preview) => {
        drafts.push(toDraft(preview, fieldOptions));
      });
    });

    if (pending.length > 0) {
      return { status: 'loading', drafts: [], pending, errors } as const;
    }
    if (errors.length > 0 && drafts.length === 0) {
      return { status: 'error', drafts: [], pending: [], errors } as const;
    }
    if (drafts.length === 0) {
      return { status: 'wrong-category', drafts: [], pending: [], errors } as const;
    }
    return { status: 'ready', drafts, pending: [], errors } as const;
  }, [extractionIds, queries, fieldOptions]);
}

function extractProductionUnitPreviews(
  extraction: FileExtractionResponse,
): readonly ProductionUnitPreview[] {
  if (!extraction.extractedData) return [];
  if (extraction.category === 'production_units' || extraction.category === 'agricultural') {
    const data = extraction.extractedData as { productionUnits?: readonly ProductionUnitPreview[] };
    return data.productionUnits ?? [];
  }
  return [];
}

function toDraft(
  preview: ProductionUnitPreview,
  fieldOptions: readonly { id: string; name: string }[],
): ProductionUnitDraft {
  const base = createEmptyDraft();
  const source = preview.allocations ?? preview.fieldAllocations ?? [];
  const allocations: FieldAllocation[] = source.map((alloc) => {
    const resolvedId =
      alloc.fieldId?.trim() ||
      matchFieldByName(alloc.fieldName ?? undefined, fieldOptions) ||
      '';
    return {
      fieldId: resolvedId,
      areaHa: typeof alloc.areaHa === 'number' && Number.isFinite(alloc.areaHa) ? alloc.areaHa : 0,
      fieldName: alloc.fieldName ?? undefined,
    };
  });
  return {
    ...base,
    name: preview.name ?? '',
    cropName: preview.cropName ?? '',
    cropType: preview.cropType ?? '',
    variety: preview.variety ?? '',
    protocoll: preview.protocoll ?? base.protocoll,
    protectionStructure: preview.protectionStructure ?? base.protectionStructure,
    startDate: preview.startDate ?? '',
    endDate: preview.endDate ?? '',
    allocations,
  };
}
