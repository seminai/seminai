import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  farmRequest,
  getFarmCatalog,
  type FarmOperation,
  type OperationInput,
} from '@/services/farm-api';
export function useFarmCatalog<T>(companyId: string, kind: string) {
  return useQuery({
    queryKey: ['farm', companyId, kind],
    queryFn: () => getFarmCatalog<T>(companyId, kind),
    enabled: Boolean(companyId),
  });
}
export function useFarmOperations(companyId: string) {
  return useQuery({
    queryKey: ['farm', companyId, 'operations'],
    refetchInterval: 5000,
    queryFn: () =>
      farmRequest<FarmOperation[]>(`/farm/operations?companyId=${encodeURIComponent(companyId)}`),
    enabled: Boolean(companyId),
  });
}
export function useProposeOperation(companyId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { operation: OperationInput; idempotencyKey: string }) =>
      farmRequest<FarmOperation>('/farm/operations', 'POST', data),
    onSuccess: () => client.invalidateQueries({ queryKey: ['farm', companyId, 'operations'] }),
  });
}
export function useReviewOperation(companyId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      version: number;
      decision: 'approve' | 'reject';
      negativeReason?: string;
    }) => farmRequest(`/farm/operations/${input.id}/review`, 'POST', input),
    onSettled: () => client.invalidateQueries({ queryKey: ['farm', companyId] }),
  });
}
export function useReviseOperation(companyId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; version: number; operation: OperationInput }) =>
      farmRequest(`/farm/operations/${input.id}`, 'PUT', input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['farm', companyId, 'operations'] }),
  });
}
