export type FieldExclusionReason = 'no-surface' | 'period-mismatch' | 'fully-allocated';

export interface ExcludableField {
  readonly sauHa?: number | null;
  readonly gisHa?: number | null;
  readonly superficieCatastaleMq?: number | null;
  readonly inizioConduzione?: string | null;
  readonly fineConduzione?: string | null;
}

export interface ExcludedFieldInfo {
  readonly id: string;
  readonly name: string;
  readonly reason: FieldExclusionReason;
}

export const FIELD_EXCLUSION_LABELS: Record<FieldExclusionReason, string> = {
  'no-surface': 'Superficie mancante (SAU/catastale)',
  'period-mismatch': 'Periodo di conduzione non compatibile',
  'fully-allocated': 'SAU già interamente allocata',
};

const SQUARE_METERS_PER_HECTARE = 10000;

/**
 * Mirrors the backend availability filter (GetFieldsAvailabilityUseCase) to explain
 * why a field is absent from GET /fields/availability. Order matters and matches the
 * backend: surface check, then conduction-period overlap (missing dates default to
 * the current calendar year), else the field must be fully allocated.
 */
export function getFieldExclusionReason(
  field: ExcludableField,
  range: { readonly start: string; readonly end: string },
  referenceYear: number = new Date().getFullYear(),
): FieldExclusionReason {
  if (resolveSurfaceHa(field) === null) return 'no-surface';
  const inizio = parseDate(field.inizioConduzione) ?? new Date(referenceYear, 0, 1);
  const fine = parseDate(field.fineConduzione) ?? new Date(referenceYear, 11, 31);
  const start = new Date(range.start);
  const end = new Date(range.end);
  const overlaps = inizio <= end && fine >= start;
  if (!overlaps) return 'period-mismatch';
  return 'fully-allocated';
}

function resolveSurfaceHa(field: ExcludableField): number | null {
  if (typeof field.sauHa === 'number' && field.sauHa > 0) return field.sauHa;
  if (typeof field.gisHa === 'number' && field.gisHa > 0) return field.gisHa;
  if (typeof field.superficieCatastaleMq === 'number' && field.superficieCatastaleMq > 0) {
    return field.superficieCatastaleMq / SQUARE_METERS_PER_HECTARE;
  }
  return null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
