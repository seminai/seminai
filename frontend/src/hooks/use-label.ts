import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  useGetLabelsId,
  usePutLabelsId,
  usePostLabelsVerifyLabelId,
  getGetLabelsIdQueryKey,
  getGetLabelsSummaryQueryKey,
} from '@/generated/api/labels/labels';
import type { PutLabelsIdBody } from '@/generated/schemas';
import { parseLabelDetail, type LabelDetailView } from '@/types/label';

interface UseLabelResult {
  readonly label: LabelDetailView | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly saveAsync: (data: PutLabelsIdBody) => Promise<unknown>;
  readonly verifyAsync: (isVerified: boolean) => Promise<unknown>;
  readonly isSaving: boolean;
  readonly isVerifying: boolean;
}

/**
 * Loads a single product label and exposes edit + verify mutations, invalidating both the
 * detail (`['/labels/{id}']`) and the summary list on success.
 */
export function useLabel(id: string): UseLabelResult {
  const queryClient = useQueryClient();
  const query = useGetLabelsId(id, { query: { enabled: Boolean(id) } });
  const label = useMemo(() => parseLabelDetail(query.data), [query.data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getGetLabelsIdQueryKey(id) });
    void queryClient.invalidateQueries({ queryKey: getGetLabelsSummaryQueryKey() });
  };

  const updateMutation = usePutLabelsId({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Dati salvati');
      },
      onError: () => toast.error('Errore durante il salvataggio'),
    },
  });

  const verifyMutation = usePostLabelsVerifyLabelId({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success('Stato verifica aggiornato');
      },
      onError: () => toast.error("Errore durante l'aggiornamento dello stato"),
    },
  });

  return {
    label,
    isLoading: query.isLoading,
    isError: query.isError,
    saveAsync: (data: PutLabelsIdBody) => updateMutation.mutateAsync({ id, data }),
    verifyAsync: (isVerified: boolean) => verifyMutation.mutateAsync({ id, data: { isVerified } }),
    isSaving: updateMutation.isPending,
    isVerifying: verifyMutation.isPending,
  };
}
