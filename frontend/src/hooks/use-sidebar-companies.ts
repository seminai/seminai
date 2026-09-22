import { useMemo } from 'react';
import { useCompanies } from '@/hooks/use-company-options';
import { useExtractionsList } from '@/hooks/use-extractions';

export interface SidebarCompany {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
}

/**
 * Shared company-list derivation for the sidebar collections section.
 * Uses the real companies API, falling back to companies referenced by the
 * extractions list when the companies endpoint returns nothing. Returns the
 * merged list sorted by most-recently-updated first.
 */
export function useSidebarCompanies(): { readonly companies: readonly SidebarCompany[] } {
  const { companies } = useCompanies();
  const { data: extractionsData } = useExtractionsList({
    page: 1,
    pageSize: 300,
    includeGenerated: true,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });

  const fallbackCompanies = useMemo<SidebarCompany[]>(() => {
    const items = extractionsData?.items ?? [];
    const map = new Map<string, SidebarCompany>();
    for (const item of items) {
      if (!item.companyId || map.has(item.companyId)) continue;
      map.set(item.companyId, {
        id: item.companyId,
        name: item.companyName || `Azienda ${map.size + 1}`,
        updatedAt: item.updatedAt,
      });
    }
    return [...map.values()];
  }, [extractionsData?.items]);

  const mergedCompanies = companies.length > 0 ? companies : fallbackCompanies;

  const sorted = useMemo(
    () => [...mergedCompanies].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [mergedCompanies],
  );

  return { companies: sorted };
}
