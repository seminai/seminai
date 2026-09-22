/**
 * Normalizes product names for deterministic label matching and aliases.
 */
export function normalizeLabelProductName(productName: string): string {
  return productName.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Normalizes ministerial registration numbers by keeping digits and stripping
 * leading zeros. Empty values and unknown zero-like values return null.
 */
export function normalizeLabelRegistrationNumber(registrationNumber: string): string | null {
  const digits = registrationNumber.replace(/\D/g, '');
  const normalized = digits.replace(/^0+/, '');
  return normalized.length > 0 ? normalized : null;
}

/**
 * Builds common registration-number variants still present in older records.
 */
export function buildRegistrationNumberVariants(registrationNumber: string): readonly string[] {
  const normalized = normalizeLabelRegistrationNumber(registrationNumber);
  const raw = registrationNumber.trim();
  const variants = new Set<string>();
  if (raw.length > 0) variants.add(raw);
  if (normalized) {
    variants.add(normalized);
    variants.add(`0${normalized}`);
    variants.add(`00${normalized}`);
  }
  return [...variants];
}
