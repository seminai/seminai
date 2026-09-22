import { useMemo } from 'react';
import type { MultiPolygon, Polygon } from 'geojson';
import { useGetFieldsCompanyCompanyId } from '@/generated/api/fields/fields';
import { extractArray } from '@/lib/api-response';
import { isGeoJsonPolygon } from '@/lib/geo-utils';

type PolygonGeometry = Polygon | MultiPolygon;

function isPolygonOrMultiPolygon(data: unknown): data is PolygonGeometry {
  if (isGeoJsonPolygon(data)) return true;
  if (!data || typeof data !== 'object') return false;
  return (data as Record<string, unknown>).type === 'MultiPolygon';
}

export function useFieldPolygon(companyId: string | null, fieldId: string | null) {
  const { data: response, isLoading } = useGetFieldsCompanyCompanyId(
    companyId ?? '',
    { query: { enabled: !!companyId } },
  );

  const polygon = useMemo<PolygonGeometry | null>(() => {
    if (!fieldId || !response?.data) return null;
    const fields = extractArray(response.data, 'fields');
    const field = fields.find((f) => (f as Record<string, unknown>).id === fieldId);
    if (!field) return null;
    const raw = (field as Record<string, unknown>).polygon;
    return isPolygonOrMultiPolygon(raw) ? raw : null;
  }, [response, fieldId]);

  return { polygon, isLoading };
}
