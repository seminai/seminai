/**
 * Italian VAT/code normalization helpers. Pure, no dependencies.
 */

/** Uppercases and strips whitespace, dots and a leading `IT` prefix. Returns null when empty. */
export function normalizeVat(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/\s+/g, '').replace(/\./g, '').replace(/^IT/, '');
  return normalized.length > 0 ? normalized : null;
}

/** True when the value normalizes to a bare 11-digit Italian VAT number. */
export function isValidItalianVat(value: string | null | undefined): boolean {
  const normalized = normalizeVat(value);
  return normalized !== null && /^[0-9]{11}$/.test(normalized);
}
