import { useQuery } from '@tanstack/react-query';

export interface CropCatalogEntry {
  readonly code: string;
  readonly species: string;
  readonly cropType: string;
  readonly sowingPeriod?: { readonly minDate: string; readonly maxDate: string };
  readonly floweringPeriod?: { readonly minDate: string; readonly maxDate: string };
  readonly harvestPeriod?: { readonly minDate: string; readonly maxDate: string };
}

async function fetchCropCatalog(): Promise<readonly CropCatalogEntry[]> {
  const response = await fetch('/datasets/crop.json');
  if (!response.ok) throw new Error('Failed to load crop catalog');
  const data = (await response.json()) as CropCatalogEntry[];
  return data;
}

export function useCropCatalog() {
  const query = useQuery({
    queryKey: ['crop-catalog'],
    queryFn: fetchCropCatalog,
    staleTime: 1000 * 60 * 60,
  });

  const options = (query.data ?? []).map((crop) => ({
    value: crop.code,
    label: crop.species,
    description: crop.cropType,
    searchKeywords: `${crop.code} ${crop.cropType}`,
  }));

  const byCode = new Map((query.data ?? []).map((crop) => [crop.code, crop]));

  return {
    crops: query.data ?? [],
    options,
    byCode,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
