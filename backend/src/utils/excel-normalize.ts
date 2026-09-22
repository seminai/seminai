/**
 * Pure spreadsheet-cell normalization helpers shared by the order-template parser
 * and product matching. No external dependencies.
 */

/** Parses an IT/EN formatted number string ("1.200,5" / "1,200.5") to a number. */
export function normalizeNumber(value: string | number): number {
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value;
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return 0;
  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');
  let normalized = trimmed;
  if (hasComma && hasDot) {
    normalized =
      trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')
        ? trimmed.replace(/\./g, '').replace(',', '.')
        : trimmed.replace(/,/g, '');
  } else if (hasComma) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (hasDot) {
    normalized = trimmed.replace(/,/g, '');
  }
  const parsed = parseFloat(normalized.replace(/\s/g, ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Lowercases, strips accents and collapses non-alphanumerics to single spaces. */
export function normalizeKey(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
