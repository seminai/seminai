const SQUARE_METERS_PER_HECTARE = 10000;
const DEFAULT_SQUARE_METERS_THRESHOLD = 1000;
const AREA_DECIMALS = 4;

export interface NormalizeAreaHaOptions {
  readonly referenceAreaSqm?: number | null;
  readonly squareMetersThreshold?: number;
}

export function normalizeAreaHa(
  value: unknown,
  options: NormalizeAreaHaOptions = {},
): number | null {
  const numeric = parseAreaNumber(value);
  if (numeric === null || numeric <= 0) {
    return null;
  }

  const referenceAreaSqm = parseAreaNumber(options.referenceAreaSqm);
  if (referenceAreaSqm !== null && referenceAreaSqm > 0 && nearlyEqual(numeric, referenceAreaSqm)) {
    return roundArea(numeric / SQUARE_METERS_PER_HECTARE);
  }

  const threshold = options.squareMetersThreshold ?? DEFAULT_SQUARE_METERS_THRESHOLD;
  if (numeric >= threshold) {
    return roundArea(numeric / SQUARE_METERS_PER_HECTARE);
  }

  return roundArea(numeric);
}

function parseAreaNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const raw = value.trim();
  if (!raw) {
    return null;
  }

  const euThousands = /^-?[0-9]{1,3}(\.[0-9]{3})+(,[0-9]+)?$/.test(raw);
  const euDecimal = /,\d+$/.test(raw);
  if (euThousands || euDecimal) {
    const parsed = Number(raw.replace(/\./g, '').replace(/,/g, '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const usThousands = /^-?[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$/.test(raw);
  if (usThousands) {
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(raw.replace(/,/g, '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001;
}

function roundArea(value: number): number {
  const factor = 10 ** AREA_DECIMALS;
  return Math.round(value * factor) / factor;
}
