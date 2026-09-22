import { useMemo } from 'react';
import { useNominatimSearch } from '@/hooks/use-nominatim-search';

export interface FieldCenterFallback {
  readonly lat: number;
  readonly lon: number;
  readonly bbox: readonly [number, number, number, number];
}

interface UseFieldCenterFallbackResult {
  readonly data: FieldCenterFallback | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
}

// Geocodes the field's "comune" (city) via Nominatim to provide a map center
// fallback when polygon and lat/lng are missing. When multiple results match
// (ambiguous city names), the first result is used: Nominatim already orders
// by relevance.
export function useFieldCenterFallback(city: string | null): UseFieldCenterFallbackResult {
  const query = city && city.trim().length > 0 ? `${city.trim()}, Italia` : '';
  const { data, isLoading, isError } = useNominatimSearch(query);

  const result = useMemo<FieldCenterFallback | null>(() => {
    if (!data || data.length === 0) return null;
    const first = data[0];
    return { lat: first.lat, lon: first.lon, bbox: first.bbox };
  }, [data]);

  return { data: result, isLoading, isError };
}
