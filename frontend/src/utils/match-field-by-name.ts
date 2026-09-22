import type { CompanyFieldOption } from '@/components/organisms/manual-add/use-company-fields';

/**
 * Returns the id of the first company field whose name matches `candidate`
 * case-insensitively (trimmed). Returns undefined when there is no match
 * or when the input is empty.
 *
 * FE-only fallback for resolving cadastral references: the company-fields
 * endpoint does not expose foglio/particella/sezione, so when the BE has not
 * already set `fieldId` on an extracted allocation the FE can only match by
 * field name (e.g. "Vigna est", "Particella 12").
 */
export function matchFieldByName(
  candidate: string | undefined,
  fieldOptions: readonly CompanyFieldOption[],
): string | undefined {
  if (!candidate) return undefined;
  const normalized = candidate.trim().toLowerCase();
  if (!normalized) return undefined;
  const match = fieldOptions.find((option) => option.name.trim().toLowerCase() === normalized);
  return match?.id;
}
