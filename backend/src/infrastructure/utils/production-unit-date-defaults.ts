/**
 * Resolves a production unit date, falling back to the boundary of the current year
 * (or a given reference year) when the value is missing. Keeps PU periods aligned with
 * the same full-year default used for field conduction dates, avoiding mismatches
 * between field availability and production unit periods.
 */
export type ProductionUnitDateBoundary = 'start' | 'end';

export function resolvePuDateOrDefault(
  value: unknown,
  boundary: ProductionUnitDateBoundary,
  referenceYear: number = new Date().getFullYear(),
): Date {
  const parsed = parseDate(value);
  if (parsed) return parsed;
  return boundary === 'start' ? new Date(referenceYear, 0, 1) : new Date(referenceYear, 11, 31);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}
