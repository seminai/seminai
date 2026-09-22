import { useMemo } from 'react';
import { useGetFieldsCompanyCompanyId } from '@/generated/api/fields/fields';

export interface CompanyFieldOption {
  readonly id: string;
  readonly name: string;
  readonly sauHa?: number | null;
  readonly gisHa?: number | null;
  readonly superficieCatastaleMq?: number | null;
  readonly inizioConduzione?: string | null;
  readonly fineConduzione?: string | null;
}

interface UseCompanyFieldsResult {
  readonly fieldOptions: readonly CompanyFieldOption[];
  readonly isLoading: boolean;
  readonly getFieldName: (id: string) => string;
}

export function useCompanyFields(companyId: string): UseCompanyFieldsResult {
  const { data, isLoading } = useGetFieldsCompanyCompanyId(companyId, {
    query: { enabled: !!companyId },
  });
  const fieldOptions = useMemo(() => extractFields(data), [data]);

  const getFieldName = (id: string): string => {
    if (!id) return '';
    return fieldOptions.find((option) => option.id === id)?.name ?? id;
  };

  return { fieldOptions, isLoading, getFieldName };
}

// Field entities always serialize these keys (null when unset); nested
// production units and source files never do. Keeps the recursive walk from
// collecting non-field objects that also carry id + name.
const FIELD_MARKER_KEYS = ['superficieCatastaleMq', 'foglio', 'particella', 'sauHa'] as const;

function extractFields(raw: unknown): CompanyFieldOption[] {
  const out: CompanyFieldOption[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const obj = value as Record<string, unknown>;
    if (
      typeof obj.id === 'string' &&
      (typeof obj.name === 'string' || typeof obj.address === 'string') &&
      FIELD_MARKER_KEYS.some((key) => key in obj)
    ) {
      const id = obj.id;
      if (!seen.has(id)) {
        seen.add(id);
        const name =
          (typeof obj.name === 'string' ? obj.name : undefined) ??
          (typeof obj.address === 'string' ? obj.address : undefined) ??
          id;
        out.push({
          id,
          name,
          sauHa: numberOrNull(obj.sauHa),
          gisHa: numberOrNull(obj.gisHa),
          superficieCatastaleMq: numberOrNull(obj.superficieCatastaleMq),
          inizioConduzione: stringOrNull(obj.inizioConduzione),
          fineConduzione: stringOrNull(obj.fineConduzione),
        });
      }
    }
    Object.values(obj).forEach(visit);
  };
  visit(raw);
  return out;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
