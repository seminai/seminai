/**
 * Resolves a field's conduction period (inizioConduzione/fineConduzione), filling in
 * a full-year default when either boundary is missing. This keeps availability checks
 * consistent even when source files omit conduction dates.
 */
export interface FieldConductionDates {
  readonly inizioConduzione: Date;
  readonly fineConduzione: Date;
}

export function resolveFieldConductionDates(
  inizio: Date | string | null | undefined,
  fine: Date | string | null | undefined,
  referenceYear: number = new Date().getFullYear(),
): FieldConductionDates {
  const parsedInizio = parseDate(inizio);
  const parsedFine = parseDate(fine);
  return {
    inizioConduzione: parsedInizio ?? buildYearStart(referenceYear),
    fineConduzione: parsedFine ?? buildYearEnd(referenceYear),
  };
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildYearStart(year: number): Date {
  return new Date(year, 0, 1);
}

function buildYearEnd(year: number): Date {
  return new Date(year, 11, 31);
}
