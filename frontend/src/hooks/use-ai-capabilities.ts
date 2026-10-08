import { useQuery } from '@tanstack/react-query';
import { fetchPublicRuntimeConfig } from '@/lib/public-runtime-config';
export function useAiCapabilities() {
  return useQuery({
    queryKey: ['public-runtime-config'],
    queryFn: fetchPublicRuntimeConfig,
    staleTime: 30000,
  }).data?.ai;
}
