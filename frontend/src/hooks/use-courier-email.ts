import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';

interface ApiEnvelope<T> {
  readonly status: string;
  readonly data: T;
}

const courierEmailKey = (companyId: string) => ['commercial', 'courier-email', companyId] as const;

/** Reads the configured courier-summary recipient email for a company. */
export function useCourierEmail(companyId: string | undefined) {
  return useQuery({
    queryKey: courierEmailKey(companyId ?? ''),
    enabled: Boolean(companyId),
    queryFn: async () => {
      const res = await customFetch<ApiEnvelope<{ courierEmail: string | null }>>({
        url: '/commercial/courier-email',
        method: 'GET',
        params: { companyId: companyId ?? '' },
      });
      return res.data.courierEmail;
    },
  });
}

/** Updates the courier-summary recipient email. */
export function useUpdateCourierEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: string; courierEmail: string | null }) => {
      const res = await customFetch<ApiEnvelope<{ courierEmail: string | null }>>({
        url: '/commercial/courier-email',
        method: 'PATCH',
        data: { companyId: vars.companyId, courierEmail: vars.courierEmail },
      });
      return res.data.courierEmail;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: courierEmailKey(vars.companyId) });
    },
  });
}
