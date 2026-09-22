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

const MASS_UNIT_FACTORS: Readonly<Record<string, number>> = {
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

const VOLUME_UNIT_FACTORS: Readonly<Record<string, number>> = {
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

const DECIMALS = 6;

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

const normalizeUnitString = (raw?: string | null): string => {
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

const splitUnitExpression = (
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

const detectQuantityUnit = (
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

const inferBaseUnitFromExpression = (
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

const guessBaseUnitFromString = (unitRaw?: string | null): BaseQuantityUnit => {
  const value = unitRaw?.toLowerCase() ?? '';
  if (value.includes('l') || value.includes('ml') || value.includes('hl')) {
    return 'L';
  }
  return 'kg';
};

const computePerHaMultiplier = (denominator: string, waterVolumeHl: number): number => {
  if (!denominator || denominator === 'ha') {
    return 1;
  }
  if (denominator === 'hl') {
    return waterVolumeHl;
  }
  if (denominator === 'l') {
    return waterVolumeHl * 100;
  }
  if (denominator === 'm3' || denominator === 'mc') {
    return waterVolumeHl * 0.1;
  }
  return 1;
};

const resolveWaterVolumeHlPerHa = (
  value?: number | null,
  unitRaw?: string | null,
): number | null => {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = normalizeUnitString(unitRaw);
  if (!unit) return null;
  if (unit.includes('/ha')) {
    const volumeToken = unit.split('/ha')[0];
    const liters = convertVolumeToLiters(value, volumeToken);
    return liters !== null ? liters / 100 : null;
  }
  if (unit === 'hl' || unit === 'l' || unit === 'm3' || unit === 'mc') {
    const liters = convertVolumeToLiters(value, unit);
    return liters !== null ? liters / 100 : null;
  }
  return null;
};

const convertVolumeToLiters = (value: number, token: string): number | null => {
  if (!token) return null;
  if (VOLUME_UNIT_FACTORS[token] !== undefined) {
    return value * VOLUME_UNIT_FACTORS[token];
  }
  return null;
};

const pickSourceValue = (preferred?: number | null, fallback?: number | null): number => {
  if (typeof preferred === 'number' && Number.isFinite(preferred) && preferred >= 0) {
    return preferred;
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback >= 0) {
    return fallback;
  }
  return 0;
};

const roundValue = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const factor = 10 ** DECIMALS;
  return Math.round(value * factor) / factor;
};

const QUANTITY_DECIMALS = 3;

/**
 * Rounds a quantity value to a fixed number of decimal places (3 decimals).
 * Used for job quantities and stock amounts.
 */
export const roundQuantity = (value: number): number => {
  return Number(value.toFixed(QUANTITY_DECIMALS));
};

/**
 * Checks if a unit of measure represents a fluid (L, ml, litri, etc.).
 * Uses the VOLUME_UNIT_FACTORS dictionary instead of hardcoded string matching.
 */
export const isFluidUnit = (unit: string | null | undefined): boolean => {
  if (!unit) {
    return false;
  }
  const normalized = normalizeUnitString(unit);
  const { numerator } = splitUnitExpression(normalized);
  const token = numerator || normalized;
  return VOLUME_UNIT_FACTORS[token] !== undefined;
};

/**
 * Gets the conversion factor to liters for a given volume unit.
 * Returns null if the unit is not a recognized volume unit.
 */
export const getVolumeToLitersFactor = (unit: string | null | undefined): number | null => {
  if (!unit) {
    return null;
  }
  const normalized = normalizeUnitString(unit);
  const { numerator } = splitUnitExpression(normalized);
  const token = numerator || normalized;
  return VOLUME_UNIT_FACTORS[token] ?? null;
};

export interface ConvertDoseToHlParams {
  readonly dose: number | null | undefined;
  readonly doseUm: string | null | undefined;
  readonly treatedSurface: number | null;
}

/**
 * Converts dose to hectoliters based on unit of measure.
 * Uses the VOLUME_UNIT_FACTORS dictionary for accurate conversions instead of hardcoded values.
 * @param params.dose - Dose value per hectare
 * @param params.doseUm - Unit of measure (e.g., "L/ha", "ml/ha", "cl/ha")
 * @param params.treatedSurface - Treated surface in hectares
 * @returns Dose in hectoliters or null if not a fluid or invalid input
 */
export const convertDoseToHl = (params: ConvertDoseToHlParams): number | null => {
  const { dose, doseUm, treatedSurface } = params;
  if (dose === null || dose === undefined || treatedSurface === null || treatedSurface <= 0) {
    return null;
  }
  if (!isFluidUnit(doseUm)) {
    return null;
  }
  const litersFactor = getVolumeToLitersFactor(doseUm);
  if (litersFactor === null) {
    return null;
  }
  const totalInLiters = dose * treatedSurface * litersFactor;
  return roundQuantity(totalInLiters / 100);
};

export interface WaterForJobResult {
  readonly waterHlJob: number | null;
  readonly acquaMaxJob: number | null;
  readonly acquaMaxJob_um: string | null;
}

export interface CalculateWaterForJobParams {
  readonly acquaMax: number | null | undefined;
  readonly acquaMaxUm: string | null | undefined;
  readonly treatedSurface: number | null;
}

/**
 * Calculates water-related values for the job.
 * Uses the VOLUME_UNIT_FACTORS dictionary for accurate conversions.
 * @param params.acquaMax - Maximum water per hectare from label
 * @param params.acquaMaxUm - Unit of measure for water (e.g., "L/ha", "l/ha")
 * @param params.treatedSurface - Treated surface in hectares
 * @returns Object with waterHlJob (hectoliters), acquaMaxJob (total water), and acquaMaxJob_um
 */
export const calculateWaterForJob = (params: CalculateWaterForJobParams): WaterForJobResult => {
  const { acquaMax, acquaMaxUm, treatedSurface } = params;
  if (
    acquaMax === null ||
    acquaMax === undefined ||
    treatedSurface === null ||
    treatedSurface <= 0
  ) {
    return { waterHlJob: null, acquaMaxJob: null, acquaMaxJob_um: null };
  }
  const litersFactor = getVolumeToLitersFactor(acquaMaxUm) ?? 1;
  const totalWaterLiters = roundQuantity(acquaMax * treatedSurface * litersFactor);
  const waterHl = roundQuantity(totalWaterLiters / 100);
  const baseUnit =
    acquaMaxUm
      ?.replace(/\/ha/i, '')
      .replace(/\/ettaro/i, '')
      .trim() || 'L';
  return {
    waterHlJob: waterHl,
    acquaMaxJob: totalWaterLiters,
    acquaMaxJob_um: baseUnit,
  };
};

export interface GetEffectiveAreaHaParams {
  readonly unitAreaHa: number;
  readonly treatedAreaHa?: number;
  readonly isLocalizedTreatment?: boolean;
}

/**
 * Returns the effective area (ha) for dosage calculation.
 * - Trattamento a pieno campo (isLocalizedTreatment !== true): entire unit area.
 * - Trattamento localizzato (isLocalizedTreatment === true): treatedAreaHa if valid, capped by unitAreaHa.
 */
export const getEffectiveAreaHa = (params: GetEffectiveAreaHaParams): number => {
  const { unitAreaHa, treatedAreaHa, isLocalizedTreatment } = params;
  const validTreatedAreaHa =
    typeof treatedAreaHa === 'number' && Number.isFinite(treatedAreaHa) && treatedAreaHa > 0;
  if (isLocalizedTreatment === true && validTreatedAreaHa) {
    return Math.min(treatedAreaHa, unitAreaHa);
  }
  return unitAreaHa;
};
