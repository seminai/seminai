import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import { useCompanies } from '@/hooks/use-company-options';

export interface ExpiringFile {
  readonly id: string;
  readonly name: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly expiresAt: string;
  readonly reminderDaysBefore: number;
  readonly alertStatus: string;
  readonly daysUntilExpiry: number;
}

interface ExpiringFileRaw {
  readonly id: string;
  readonly name: string;
  readonly companyId: string;
  readonly expiresAt: string;
  readonly reminderDaysBefore: number;
  readonly alertStatus: string;
  readonly daysUntilExpiry: number;
}

interface ExpiringFilesResponse {
  readonly data: { readonly files: readonly ExpiringFileRaw[] };
}

async function fetchExpiringFiles(
  companyId: string,
  signal?: AbortSignal,
): Promise<ExpiringFilesResponse> {
  return customFetch<ExpiringFilesResponse>({
    url: '/files/expiring',
    method: 'GET',
    params: { companyId },
    signal,
  });
}

export function useExpiringFiles() {
  const { companies, isLoading: companiesLoading } = useCompanies();

  const queries = useQueries({
    queries: companies.map((company) => ({
      queryKey: ['files', 'expiring', company.id] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchExpiringFiles(company.id, signal),
      staleTime: 5 * 60 * 1000,
      enabled: !companiesLoading,
    })),
  });

  const companyMap = useMemo(
    () => new Map(companies.map((c) => [c.id, c.name])),
    [companies],
  );

  const files = useMemo<readonly ExpiringFile[]>(() => {
    const all: ExpiringFile[] = [];
    for (const query of queries) {
      if (!query.data?.data?.files) continue;
      for (const file of query.data.data.files) {
        all.push({
          ...file,
          companyName: companyMap.get(file.companyId) ?? 'Azienda',
        });
      }
    }
    return all.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }, [queries, companyMap]);

  const isLoading = companiesLoading || queries.some((q) => q.isLoading);

  return { files, isLoading };
}
