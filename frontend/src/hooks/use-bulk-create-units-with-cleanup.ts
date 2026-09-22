import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  usePostProductionUnitsBulkCreate,
  getGetProductionUnitsQueryKey,
} from '@/generated/api/production-units/production-units';
import { useDeleteExtraction } from '@/hooks/use-extractions';
import { ApiError } from '@/lib/api-client';
import { capture } from '@/lib/analytics';

interface UseBulkCreateUnitsWithCleanupParams {
  readonly extractionIds?: readonly string[];
}

/**
 * Wraps `usePostProductionUnitsBulkCreate` with two side effects:
 *  - on success, invalidate the production-units list query and toast the
 *    number of created units;
 *  - if the wizard was prefilled from extractions, delete each consumed
 *    extraction record best-effort so the archive stays clean;
 *  - navigate back to the manual-add landing in both cases.
 */
export function useBulkCreateUnitsWithCleanup({
  extractionIds,
}: UseBulkCreateUnitsWithCleanupParams) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteExtractionMutation = useDeleteExtraction();

  return usePostProductionUnitsBulkCreate({
    mutation: {
      onSuccess: (_response, variables) => {
        void queryClient.invalidateQueries({ queryKey: getGetProductionUnitsQueryKey() });
        const count = variables.data.productionUnits.length;
        capture('production_unit_wizard_completed', { unit_count: count });
        toast.success(`${count} ${count === 1 ? 'unità creata' : 'unità create'}`);
        if (extractionIds && extractionIds.length > 0) {
          extractionIds.forEach((id) => {
            deleteExtractionMutation.mutate(id, {
              onError: () =>
                console.warn(`[useBulkCreateUnitsWithCleanup] cleanup failed for ${id}`),
            });
          });
        }
        void navigate({ to: '/add-data', search: { type: 'manual' } });
      },
      onError: (error: unknown) => {
        const description =
          error instanceof ApiError
            ? error.message
            : error instanceof Error && error.message
              ? error.message
              : 'Errore durante la creazione delle unità produttive';
        toast.error('Creazione non riuscita', { description });
      },
    },
  });
}
