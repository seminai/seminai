/**
 * Parses a single packaging descriptor (unit volume/weight per piece) from a
 * product description, e.g. "REXXAR DA ML 300" -> { value: 300, unit: 'ML' }.
 *
 * Used during invoice extraction to recover the canonical conversion when the
 * extracted quantityUnitOfMeasure is a container UDM (PZ, NR, CF, SC, CT, CN)
 * and the description carries the actual content volume/weight.
 *
 * Conservative by design: returns null whenever the input is ambiguous (multiple
 * conflicting descriptors), to avoid producing wrong conversions on packaging
 * that already represents a self-contained unit.
 */

export type PackagingCanonicalUnit = 'ML' | 'L' | 'KG' | 'G';

export interface PackagingDescriptor {
  readonly value: number;
  readonly unit: PackagingCanonicalUnit;
}

const UNIT_TO_CANONICAL: Readonly<Record<string, PackagingCanonicalUnit>> = {
  KG: 'KG',
  CHILOGRAMMI: 'KG',
  CHILOGRAMMO: 'KG',
  G: 'G',
  GR: 'G',
  GRAMMI: 'G',
  GRAMMO: 'G',
  L: 'L',
  LT: 'L',
  LITRI: 'L',
  LITRO: 'L',
  ML: 'ML',
  MILLILITRI: 'ML',
  MILLILITRO: 'ML',
};

const UNIT_TOKEN =
  '(?:KG|CHILOGRAMMI|CHILOGRAMMO|GRAMMI|GRAMMO|GR|G|LITRI|LITRO|LT|L|MILLILITRI|MILLILITRO|ML)';
const NUMBER_TOKEN = '\\d+(?:[.,]\\d+)?';

const PACKAGING_REGEX = new RegExp(
  `(?:\\b(${NUMBER_TOKEN})\\s*(${UNIT_TOKEN})\\b)|(?:\\b(${UNIT_TOKEN})\\s+(${NUMBER_TOKEN})\\b)`,
  'gi',
);

function toNumber(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function parsePackagingFromDescription(
  description: string | null | undefined,
): PackagingDescriptor | null {
  if (!description) return null;
  const matches: PackagingDescriptor[] = [];
  for (const match of description.matchAll(PACKAGING_REGEX)) {
    const rawNumber = match[1] ?? match[4];
    const rawUnit = (match[2] ?? match[3])?.toUpperCase();
    if (!rawNumber || !rawUnit) continue;
    const canonical = UNIT_TO_CANONICAL[rawUnit];
    if (!canonical) continue;
    const value = toNumber(rawNumber);
    if (!isPositiveFinite(value)) continue;
    matches.push({ value, unit: canonical });
  }
  if (matches.length === 0) return null;
  const signature = (entry: PackagingDescriptor) => `${entry.value}_${entry.unit}`;
  const unique = new Set(matches.map(signature));
  if (unique.size > 1) return null;
  return matches[0];
}
