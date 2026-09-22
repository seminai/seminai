import { DECIMALS, VOLUME_UNIT_FACTORS, normalizeUnitString, splitUnitExpression } from './unitConversion.part-01-base-quantity-unit';

export const computePerHaMultiplier = (denominator: string, waterVolumeHl: number): number => {
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

export const resolveWaterVolumeHlPerHa = (
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

export const convertVolumeToLiters = (value: number, token: string): number | null => {
  if (!token) return null;
  if (VOLUME_UNIT_FACTORS[token] !== undefined) {
    return value * VOLUME_UNIT_FACTORS[token];
  }
  return null;
};

export const pickSourceValue = (preferred?: number | null, fallback?: number | null): number => {
  if (typeof preferred === 'number' && Number.isFinite(preferred) && preferred >= 0) {
    return preferred;
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback >= 0) {
    return fallback;
  }
  return 0;
};

export const roundValue = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const factor = 10 ** DECIMALS;
  return Math.round(value * factor) / factor;
};

export const QUANTITY_DECIMALS = 3;

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
