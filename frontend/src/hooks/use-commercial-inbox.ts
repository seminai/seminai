import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import { useCompanies } from '@/hooks/use-company-options';
import { isAgriculturalCompany } from '@/types/company-kind';
import type {
  CommercialInboxItem,
  CommercialInboxItemEnriched,
  CommercialInboxItemType,
} from '@/types/commercial';

interface CommercialInboxResponse {
  readonly data: { readonly items: readonly CommercialInboxItem[] };
}

/** Priority weights — must mirror the backend comparator. */
const TYPE_WEIGHT: Record<CommercialInboxItemType, number> = {
  SEND_COURIER_SUMMARY: 0,
  SEND_PAYMENT_REMINDER: 1,
  SHIP_TODAY: 2,
  GENERATE_DDT: 3,
  GENERATE_PROFORMA: 4,
  REVIEW_ATTACHMENT: 5,
  PROCESS_ORDER: 6,
  OPEN_CHAT: 7,
};

function compareItems(a: CommercialInboxItemEnriched, b: CommercialInboxItemEnriched): number {
  const weightDiff = TYPE_WEIGHT[a.type] - TYPE_WEIGHT[b.type];
  return weightDiff !== 0 ? weightDiff : b.ageDays - a.ageDays;
}

async function fetchInbox(
  companyId: string,
  signal?: AbortSignal,
): Promise<CommercialInboxResponse> {
  return customFetch<CommercialInboxResponse>({
    url: '/commercial/inbox',
    method: 'GET',
    params: { companyId },
    signal,
  });
}

/** Aggregates the commercial inbox across all the user's companies. */
export function useCommercialInbox() {
  const { companies, isLoading: companiesLoading } = useCompanies();
  const agriculturalCompanies = useMemo(
    () => companies.filter((company) => isAgriculturalCompany(company.kind)),
    [companies],
  );

  const queries = useQueries({
    queries: agriculturalCompanies.map((company) => ({
      queryKey: ['commercial', 'inbox', company.id] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchInbox(company.id, signal),
      staleTime: 5 * 60 * 1000,
      enabled: !companiesLoading,
    })),
  });

  const companyMap = useMemo(
    () => new Map(agriculturalCompanies.map((c) => [c.id, c.name])),
    [agriculturalCompanies],
  );

  const items = useMemo<readonly CommercialInboxItemEnriched[]>(() => {
    const all: CommercialInboxItemEnriched[] = [];
    for (const query of queries) {
      if (!query.data?.data?.items) continue;
      for (const item of query.data.data.items) {
        all.push({ ...item, companyName: companyMap.get(item.companyId) ?? 'Azienda' });
      }
    }
    return all.sort(compareItems);
  }, [queries, companyMap]);

  const isLoading = companiesLoading || queries.some((q) => q.isLoading);

  return { items, isLoading };
}
