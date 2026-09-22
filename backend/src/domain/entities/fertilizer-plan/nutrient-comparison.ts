import { NutrientKey } from './types';

/**
 * Returns the relative difference between actual and expected nutrient supply,
 * expressed as a percentage. Returns null when the expected value is zero
 * (no requirement → cannot compute a meaningful delta).
 */
export function calculateNutrientDeltaPercent(
  actualPerHa: number,
  expectedPerHa: number,
): number | null {
  if (!Number.isFinite(actualPerHa) || !Number.isFinite(expectedPerHa)) return null;
  if (Math.abs(expectedPerHa) < 0.0001) return null;
  return ((actualPerHa - expectedPerHa) / expectedPerHa) * 100;
}

/**
 * Builds the per-nutrient delta map for one weekly slot, given the absolute
 * expected and actual values. Pure function — no side effects.
 */
export function buildDeltaPercents(
  expected: Readonly<Record<NutrientKey, number>>,
  actual: Readonly<Record<NutrientKey, number>>,
  nutrients: readonly NutrientKey[],
): Record<NutrientKey, number | null> {
  return nutrients.reduce(
    (acc, key) => {
      acc[key] = calculateNutrientDeltaPercent(actual[key] ?? 0, expected[key] ?? 0);
      return acc;
    },
    {} as Record<NutrientKey, number | null>,
  );
}
