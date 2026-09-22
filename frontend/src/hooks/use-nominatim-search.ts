import { useQuery } from '@tanstack/react-query';
import { NOMINATIM_BASE_URL } from '@/lib/map-config';

export interface NominatimResult {
  readonly displayName: string;
  readonly lat: number;
  readonly lon: number;
  readonly bbox: [number, number, number, number];
}

interface NominatimRawResult {
  readonly display_name: string;
  readonly lat: string;
  readonly lon: string;
  readonly boundingbox: [string, string, string, string];
}

async function fetchNominatim(query: string, signal?: AbortSignal): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    countrycodes: 'it',
  });
  const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json', 'Accept-Language': 'it' },
  });
  if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);
  const raw = (await response.json()) as NominatimRawResult[];
  return raw.map((item) => ({
    displayName: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
    bbox: [
      Number(item.boundingbox[0]),
      Number(item.boundingbox[1]),
      Number(item.boundingbox[2]),
      Number(item.boundingbox[3]),
    ],
  }));
}

export function useNominatimSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['nominatim-search', trimmed],
    queryFn: ({ signal }) => fetchNominatim(trimmed, signal),
    enabled: trimmed.length >= 3,
    staleTime: 15 * 60 * 1000,
    retry: 0,
  });
}
