import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';

interface FilterOptionsResponse {
  readonly fileNames: readonly string[];
  readonly companyNames: readonly string[];
  readonly statuses: readonly string[];
  readonly categories: readonly string[];
  readonly formats: readonly string[];
}

interface ApiResponse {
  readonly status: string;
  readonly data: FilterOptionsResponse;
}

const STATUS_LABELS: Record<string, string> = {
  LOADING: 'In caricamento',
  PENDING_CONFIRMATION: 'Da confermare',
  CONFIRMED: 'Confermato',
  ERROR: 'Errore',
};

const CATEGORY_LABELS: Record<string, string> = {
  fields: 'Campi',
  production_units: 'Unità Produttive',
  agricultural: 'Dati Agricoli',
  invoice: 'Fattura',
  ddt: 'DDT',
  stock: 'Magazzino',
};

export function useFilterOptions(): Record<string, string[]> {
  const { data } = useQuery({
    queryKey: ['extractions', 'filter-options'],
    queryFn: () =>
      customFetch<ApiResponse>({
        url: '/extractions/filter-options',
        method: 'GET',
      }).then((r) => r.data),
    staleTime: 60_000,
  });

  return useMemo((): Record<string, string[]> => {
    if (!data) return {} as Record<string, string[]>;
    const statusLabels = data.statuses
      .map((s) => STATUS_LABELS[s] ?? s)
      .concat('Generato')
      .sort();
    const categoryLabels = data.categories
      .map((c) => CATEGORY_LABELS[c] ?? c)
      .sort();
    return {
      titolo: [...data.fileNames].sort(),
      azienda: [...data.companyNames].sort(),
      status: statusLabels,
      tipoDiFile: categoryLabels,
      formato: [...data.formats].sort(),
    };
  }, [data]);
}
