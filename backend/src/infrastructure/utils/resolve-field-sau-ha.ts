const SQUARE_METERS_PER_HECTARE = 10000;

/**
 * Resolves the usable agricultural area (SAU) for a field, falling back to GIS area
 * or cadastral surface when SAU was not provided by the source file. Prevents fields
 * with only partial surface data from being silently excluded from availability checks.
 */
export function resolveFieldSauHa(
  sauHa: number | null | undefined,
  gisHa: number | null | undefined,
  superficieCatastaleMq: number | null | undefined,
): number | null {
  if (typeof sauHa === 'number' && sauHa > 0) return sauHa;
  if (typeof gisHa === 'number' && gisHa > 0) return gisHa;
  if (typeof superficieCatastaleMq === 'number' && superficieCatastaleMq > 0) {
    return superficieCatastaleMq / SQUARE_METERS_PER_HECTARE;
  }
  return null;
}
