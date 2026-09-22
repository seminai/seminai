import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import { useCompanies } from '@/hooks/use-company-options';
import { isAgriculturalCompany } from '@/types/company-kind';
import type { CommercialDeadlines } from '@/types/commercial';

interface CommercialDeadlinesResponse {
  readonly data: { readonly deadlines: CommercialDeadlines };
}

const EMPTY_DEADLINES: CommercialDeadlines = {
  ordersToProcess: 0,
  outgoingDdt: 0,
  overdueInvoices: 0,
  pendingEmails: 0,
  followUpsSent: 0,
};

async function fetchDeadlines(
  companyId: string,
  signal?: AbortSignal,
): Promise<CommercialDeadlinesResponse> {
  return customFetch<CommercialDeadlinesResponse>({
    url: '/commercial/deadlines',
    method: 'GET',
    params: { companyId },
    signal,
  });
}

/** Sums the commercial deadline widget counts across all the user's companies. */
export function useCommercialDeadlines() {
  const { companies, isLoading: companiesLoading } = useCompanies();
  const agriculturalCompanies = useMemo(
    () => companies.filter((company) => isAgriculturalCompany(company.kind)),
    [companies],
  );

  const queries = useQueries({
    queries: agriculturalCompanies.map((company) => ({
      queryKey: ['commercial', 'deadlines', company.id] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchDeadlines(company.id, signal),
      staleTime: 5 * 60 * 1000,
      enabled: !companiesLoading,
    })),
  });

  const deadlines = useMemo<CommercialDeadlines>(() => {
    return queries.reduce<CommercialDeadlines>((acc, query) => {
      const current = query.data?.data?.deadlines;
      if (!current) return acc;
      return {
        ordersToProcess: acc.ordersToProcess + current.ordersToProcess,
        outgoingDdt: acc.outgoingDdt + current.outgoingDdt,
        overdueInvoices: acc.overdueInvoices + current.overdueInvoices,
        pendingEmails: acc.pendingEmails + current.pendingEmails,
        followUpsSent: acc.followUpsSent + current.followUpsSent,
      };
    }, EMPTY_DEADLINES);
  }, [queries]);

  const isLoading = companiesLoading || queries.some((q) => q.isLoading);

  return { deadlines, isLoading };
}
