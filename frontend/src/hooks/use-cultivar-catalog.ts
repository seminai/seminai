import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CultivarCatalog,
  type CultivarsByCropIndex,
} from '@/models/CultivarCatalog';

async function fetchCultivarIndex(): Promise<CultivarsByCropIndex> {
  const response = await fetch('/datasets/cultivars-by-crop.json');
  if (!response.ok) throw new Error('Failed to load cultivar catalog');
  return (await response.json()) as CultivarsByCropIndex;
}

export function useCultivarCatalog() {
  const query = useQuery({
    queryKey: ['cultivar-catalog'],
    queryFn: fetchCultivarIndex,
    staleTime: 1000 * 60 * 60,
  });

  const catalog = useMemo(
    () => (query.data ? new CultivarCatalog(query.data) : null),
    [query.data],
  );

  return {
    catalog,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCultivarOptions(cropCode: string) {
  const { catalog, isLoading, isError } = useCultivarCatalog();

  const options = useMemo(() => {
    if (!catalog || !cropCode) return [];
    return catalog.getCultivarsForCrop(cropCode).map((entry) => ({
      value: entry.name,
      label: entry.name,
      description: entry.harvestLabel
        ? `Raccolta indicativa: ${entry.harvestLabel}`
        : undefined,
      searchKeywords: entry.id,
    }));
  }, [catalog, cropCode]);

  return { options, isLoading, isError, catalog };
}
