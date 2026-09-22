/**
 * Domain types for the fertilizer planning feature.
 *
 * Privacy boundary: branded result types make leakage compile-impossible.
 * - PrivatePlanResult contains the raw nutrient requirements and yield (NEVER expose to LLM/clients).
 * - PublicPlanResult is the only shape the agent layer is allowed to consume.
 *
 * Conversion between the two is gated by `plan-sanitizer.ts`, which is the SOLE authorized funnel.
 */

/**
 * Canonical nutrient keys used across the fertilizer pipeline.
 *
 * UNIT CONVENTION (after Phase D):
 * - Every value tagged with a NutrientKey — both on the demand side
 *   (`expectedPerHa`, `actualPerHa`, `CropRequirementWeek.{N,P2O5,...,B}`) and
 *   on the supply side (`FertilizerInput.{nitrogen,...,boron}` is % mass) —
 *   is expressed in **kg/ha** when used as a per-hectare demand/supply.
 * - The CSV loader normalizes the boron column (raw grams/ha) into kg/ha at
 *   parse time so the optimizer never has to mix units.
 * - Fertilizer composition fields are **% mass / mass** (so `dose_kg_per_ha *
 *   nutrient_pct / 100 = nutrient_kg_per_ha`). Boron now follows the same
 *   convention (was historically documented as g/kg, harmonized in Phase D).
 */
export type NutrientKey = 'N' | 'P2O5' | 'K2O' | 'MgO' | 'CaO' | 'B';

export const NUTRIENT_KEYS: readonly NutrientKey[] = [
  'N',
  'P2O5',
  'K2O',
  'MgO',
  'CaO',
  'B',
] as const;

/**
 * Macro-nutrients supported by the optimizer (B is tracked but not used as a constraint
 * unless explicitly enabled — keeps the linear program small and feasible).
 */
export const SOLVER_NUTRIENTS: readonly NutrientKey[] = ['N', 'P2O5', 'K2O', 'MgO', 'CaO'] as const;

/**
 * Per-fertilizer nutrient share (in % mass / mass).
 * Maps directly onto the new optional fields of the Prisma `Product` model.
 */
export interface FertilizerInput {
  readonly id: string;
  readonly name: string;
  readonly nitrogen: number;
  readonly phosphorus: number;
  readonly potassium: number;
  readonly magnesium: number;
  readonly calcium: number;
  readonly sulfur: number;
  readonly boron: number;
}

/**
 * Single weekly row of crop nutrient demand, in raw kg/ha (or g/ha for B) per ton of yield.
 * NEVER expose to the LLM.
 */
export interface CropRequirementWeek {
  readonly week: number;
  readonly daysAfterSowing: number;
  readonly N: number;
  readonly P2O5: number;
  readonly K2O: number;
  readonly MgO: number;
  readonly CaO: number;
  readonly B: number;
}

export interface SoilFactors {
  readonly N?: number;
  readonly P2O5?: number;
  readonly K2O?: number;
  readonly MgO?: number;
  readonly CaO?: number;
}

/**
 * Per-week solver output. Keeps both expected and actual nutrients for diagnostics.
 * Marked `__brand: 'private'` — DO NOT expose.
 */
export interface PrivateWeekPlan {
  readonly week: number;
  readonly daysAfterSowing: number;
  readonly expectedPerHa: Readonly<Record<NutrientKey, number>>;
  readonly actualPerHa: Readonly<Record<NutrientKey, number>>;
  readonly doses: Readonly<Record<string, number>>;
  readonly feasible: boolean;
  readonly uncoveredNutrients: readonly NutrientKey[];
}

export interface PrivatePlanResult {
  readonly __brand: 'private';
  readonly cropName: string;
  readonly resolvedCropFile: string;
  readonly usedGenericFallback: boolean;
  /**
   * Dimensionless multiplier applied to the per-day CSV demand.
   * Default 1.0 means "use the CSV calibration as-is".
   * In Phase B this becomes `actualYield / referenceYield` to scale the plan
   * proportionally to the user's expected yield.
   */
  readonly yieldScaleUsed: number;
  readonly perWeek: readonly PrivateWeekPlan[];
}

/**
 * Public, agent-safe plan. NO expected requirements, NO yield, NO raw demand.
 * Only doses and percentage deltas (which cannot be inverted to recover the absolute requirements).
 */
export interface PublicWeekPlan {
  readonly week: number;
  readonly daysAfterSowing: number;
  readonly doses: Readonly<Record<string, number>>;
  readonly deltaPercents: Readonly<Record<NutrientKey, number | null>>;
  readonly feasible: boolean;
  readonly uncoveredNutrients: readonly NutrientKey[];
}

export interface PublicPlanResult {
  readonly __brand: 'public';
  readonly cropName: string;
  readonly usedGenericFallback: boolean;
  /**
   * Dimensionless multiplier that was applied to the per-day demand.
   * - `1.0` means the plan is calibrated on the dataset reference yield (no
   *   user-provided yield, neutral default).
   * - Values `> 0 && != 1` mean the plan was scaled to the user's actualYield.
   *
   * Exposing the ratio (not the absolute reference yield) preserves the
   * privacy of the proprietary CSV calibration data.
   */
  readonly yieldScale: number;
  readonly perWeek: readonly PublicWeekPlan[];
  readonly totalDoses: Readonly<Record<string, number>>;
  readonly feasible: boolean;
  readonly uncoveredNutrients: readonly NutrientKey[];
}
