import convert from 'convert-units';

export interface UnitMeasureOption {
  readonly value: string;
  readonly label: string;
  readonly searchKeywords: string;
}

/** Packaging / count units used in Seminai extractions (not in convert-units). */
const PACKAGING_UNITS: readonly UnitMeasureOption[] = [
  { value: 'NR', label: 'Numero (NR)', searchKeywords: 'numero nr pezzi count' },
  { value: 'PZ', label: 'Pezzo (PZ)', searchKeywords: 'pezzo pezzi pz unità' },
  { value: 'CF', label: 'Confezione (CF)', searchKeywords: 'confezione cf conf' },
  { value: 'SC', label: 'Sacco (SC)', searchKeywords: 'sacco sacchi sc' },
  { value: 'CT', label: 'Cartone (CT)', searchKeywords: 'cartone cartoni ct' },
  { value: 'CN', label: 'Contenitore (CN)', searchKeywords: 'contenitore cn' },
  { value: 'Q', label: 'Quintale (Q)', searchKeywords: 'quintale quintali q ql' },
] as const;

const AGRICULTURAL_MASS_ABBRS = new Set(['mcg', 'mg', 'g', 'kg', 'oz', 'lb', 't']);
const AGRICULTURAL_VOLUME_ABBRS = new Set(['ml', 'l', 'kl', 'fl-oz', 'gal']);

const ITALIAN_UNIT_KEYWORDS: Readonly<Record<string, string>> = {
  kg: 'chilogrammo chilo chilogrammi kg',
  g: 'grammo grammi g',
  mg: 'milligrammo mg',
  mcg: 'microgrammo mcg',
  t: 'tonnellata tonnellate ton t',
  lb: 'libbra pound lb',
  oz: 'oncia oz',
  ml: 'millilitro millilitri ml',
  l: 'litro litri l lt',
  kl: 'kilolitro kl',
  'fl-oz': 'fluid ounce fl oz oncia liquida',
  gal: 'gallone gallon gal',
};

function toQuantityOption(entry: { abbr: string; singular: string }): UnitMeasureOption {
  const value = entry.abbr.toUpperCase();
  const italian = ITALIAN_UNIT_KEYWORDS[entry.abbr] ?? '';
  return {
    value,
    label: `${entry.singular} (${value})`,
    searchKeywords: `${entry.singular} ${entry.abbr} ${italian} ${value}`.trim(),
  };
}

function buildQuantityUnitOptions(): readonly UnitMeasureOption[] {
  const convertUnits = convert()
    .list('mass')
    .filter((entry) => AGRICULTURAL_MASS_ABBRS.has(entry.abbr))
    .concat(convert().list('volume').filter((entry) => AGRICULTURAL_VOLUME_ABBRS.has(entry.abbr)))
    .map(toQuantityOption);

  const seen = new Set<string>();
  const merged: UnitMeasureOption[] = [];
  for (const option of [...convertUnits, ...PACKAGING_UNITS]) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    merged.push(option);
  }
  return merged;
}

export const QUANTITY_UNIT_OPTIONS: readonly UnitMeasureOption[] = buildQuantityUnitOptions();

export const PRICE_UNIT_OPTIONS: readonly UnitMeasureOption[] = [
  { value: 'EUR', label: 'Euro (EUR)', searchKeywords: 'euro eur valuta prezzo totale' },
  ...QUANTITY_UNIT_OPTIONS.map((option) => ({
    value: `EUR/${option.value}`,
    label: `Euro per ${option.label}`,
    searchKeywords: `euro ${option.searchKeywords} prezzo unitario`,
  })),
];

export function parsePriceUnit(value: string): { currency: string; perUnit: string | null } {
  const trimmed = value.trim();
  if (!trimmed.includes('/')) {
    return { currency: trimmed.toUpperCase(), perUnit: null };
  }
  const [currency, perUnit] = trimmed.split('/', 2);
  return { currency: currency.toUpperCase(), perUnit: perUnit?.toUpperCase() ?? null };
}
