import { computePerHaMultiplier, pickSourceValue, resolveWaterVolumeHlPerHa, roundValue } from './unitConversion.part-02-compute-per-ha-multiplier';

export type BaseQuantityUnit = 'kg' | 'L';

export type BaseDoseUnit = `${BaseQuantityUnit}/ha`;

export interface NormalizedQuantity {
  readonly value: number;
  readonly unit: BaseQuantityUnit;
}

export interface NormalizeDoseRangeInput {
  readonly min?: number | null;
  readonly max?: number | null;
  readonly unit?: string | null;
  readonly waterVolume?: number | null;
  readonly waterVolumeUnit?: string | null;
  readonly expectedBaseUnit?: BaseQuantityUnit;
  readonly fallbackWaterVolumeHlPerHa?: number;
}

export interface NormalizedDoseRange {
  readonly min: number;
  readonly max: number;
  readonly unit: BaseDoseUnit;
}

export const DEFAULT_SPRAY_VOLUME_HL_PER_HA = 10;

export const MASS_UNIT_FACTORS: Readonly<Record<string, number>> = {
  kg: 1,
  kilogram: 1,
  kilograms: 1,
  chilogrammo: 1,
  chilogrammi: 1,
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
  grammo: 0.001,
  grammi: 0.001,
  mg: 0.000001,
  milligrammo: 0.000001,
  milligrammi: 0.000001,
  q: 100,
  quintale: 100,
  quintali: 100,
  t: 1000,
  ton: 1000,
  tonne: 1000,
  tonnellata: 1000,
  tonnellate: 1000,
};

export const VOLUME_UNIT_FACTORS: Readonly<Record<string, number>> = {
  l: 1,
  lt: 1,
  litro: 1,
  litri: 1,
  litre: 1,
  liters: 1,
  ml: 0.001,
  millilitro: 0.001,
  millilitri: 0.001,
  cl: 0.01,
  centilitro: 0.01,
  centilitri: 0.01,
  dl: 0.1,
  decilitro: 0.1,
  decilitri: 0.1,
  hl: 100,
  ettolitro: 100,
  ettolitri: 100,
  cc: 0.001,
  m3: 1000,
  mc: 1000,
};

export const DECIMALS = 6;

export const normalizeStockQuantity = (
  value: number,
  unitRaw?: string | null,
): NormalizedQuantity => {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
  const normalizedUnit = normalizeUnitString(unitRaw);
  const quantityInfo = detectQuantityUnit(normalizedUnit);
  if (quantityInfo) {
    return {
      value: roundValue(safeValue * quantityInfo.factor),
      unit: quantityInfo.unit,
    };
  }
  const fallbackUnit = guessBaseUnitFromString(unitRaw);
  return {
    value: roundValue(safeValue),
    unit: fallbackUnit,
  };
};

export const normalizeDoseRange = (input: NormalizeDoseRangeInput): NormalizedDoseRange => {
  const sanitizedUnit = normalizeUnitString(input.unit);
  const { numerator, denominator } = splitUnitExpression(sanitizedUnit);
  const numeratorInfo =
    detectQuantityUnit(numerator) ??
    (input.expectedBaseUnit
      ? {
          factor: 1,
          unit: input.expectedBaseUnit,
        }
      : inferBaseUnitFromExpression(sanitizedUnit));
  const baseUnit: BaseQuantityUnit = numeratorInfo?.unit ?? 'kg';
  const conversionFactor = numeratorInfo?.factor ?? 1;
  const fallbackWater = input.fallbackWaterVolumeHlPerHa ?? DEFAULT_SPRAY_VOLUME_HL_PER_HA;
  const waterVolumeHl =
    resolveWaterVolumeHlPerHa(input.waterVolume, input.waterVolumeUnit) ?? fallbackWater;
  const perHaMultiplier = computePerHaMultiplier(denominator, waterVolumeHl);
  const minSource = pickSourceValue(input.min, input.max);
  const maxSource = pickSourceValue(input.max, input.min);
  const convertedMin = roundValue(minSource * conversionFactor * perHaMultiplier);
  const convertedMax = roundValue(maxSource * conversionFactor * perHaMultiplier);
  const safeMin = Math.min(convertedMin, convertedMax);
  const safeMax = Math.max(convertedMin, convertedMax);
  return {
    min: safeMin,
    max: safeMax,
    unit: `${baseUnit}/ha`,
  };
};

export const normalizeUnitString = (raw?: string | null): string => {
  if (!raw) return '';
  let normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ha-1/g, '/ha')
    .replace(/ha1/g, '/ha')
    .replace(/-/g, '/')
    .replace(/\bper\b/g, '/')
    .replace(/\bperha\b/g, '/ha')
    .replace(/\s+/g, '');
  normalized = normalized
    .replace(/ettari?/g, 'ha')
    .replace(/litri?/g, 'l')
    .replace(/litro/g, 'l')
    .replace(/chilogrammi?/g, 'kg')
    .replace(/chilogrammo/g, 'kg')
    .replace(/grammi?/g, 'g')
    .replace(/grammo/g, 'g')
    .replace(/ettolitri?/g, 'hl')
    .replace(/ettolitro/g, 'hl');
  normalized = normalized.replace(/\/{2,}/g, '/');
  return normalized;
};

export const splitUnitExpression = (
  unit: string,
): { readonly numerator: string; readonly denominator: string } => {
  if (!unit) {
    return { numerator: '', denominator: 'ha' };
  }
  const parts = unit.split('/');
  const numerator = parts[0] || '';
  const denominator = parts[1] || 'ha';
  return { numerator, denominator };
};

export const detectQuantityUnit = (
  token: string,
): { readonly factor: number; readonly unit: BaseQuantityUnit } | null => {
  if (token && MASS_UNIT_FACTORS[token] !== undefined) {
    return { factor: MASS_UNIT_FACTORS[token], unit: 'kg' };
  }
  if (token && VOLUME_UNIT_FACTORS[token] !== undefined) {
    return { factor: VOLUME_UNIT_FACTORS[token], unit: 'L' };
  }
  return null;
};

export const inferBaseUnitFromExpression = (
  expression: string,
): { readonly factor: number; readonly unit: BaseQuantityUnit } | null => {
  if (!expression) return null;
  if (expression.includes('kg') || expression.includes('g') || expression.includes('mg')) {
    return { factor: 1, unit: 'kg' };
  }
  if (expression.includes('l') || expression.includes('ml') || expression.includes('hl')) {
    return { factor: 1, unit: 'L' };
  }
  return null;
};

export const guessBaseUnitFromString = (unitRaw?: string | null): BaseQuantityUnit => {
  const value = unitRaw?.toLowerCase() ?? '';
  if (value.includes('l') || value.includes('ml') || value.includes('hl')) {
    return 'L';
  }
  return 'kg';
};
