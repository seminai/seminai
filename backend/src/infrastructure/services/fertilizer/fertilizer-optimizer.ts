import { Model, solve } from 'yalps';
import {
  CropRequirementWeek,
  FertilizerInput,
  NUTRIENT_KEYS,
  NutrientKey,
  PrivatePlanResult,
  PrivateWeekPlan,
  SOLVER_NUTRIENTS,
  SoilFactors,
} from '../../../domain/entities/fertilizer-plan/types';
import { buildLpModel, getNutrientFieldKey } from './solver-constraints';

export interface OptimizerInput {
  readonly cropName: string;
  readonly resolvedCropFile: string;
  readonly usedGenericFallback: boolean;
  readonly fertilizers: readonly FertilizerInput[];
  readonly weeks: readonly CropRequirementWeek[];
  /**
   * Dimensionless multiplier on the per-day CSV demand.
   * The CSV values are already in kg/ha/day, calibrated for the reference yield
   * shipped in `dataset/fertilizer_plan/yield_crop.csv`. To scale the plan to a
   * different actual yield, pass `actualYield / referenceYield`. Default 1.0.
   */
  readonly yieldScale: number;
  readonly irrigation: number;
  readonly soilFactors?: SoilFactors;
}

/**
 * Computes the per-week optimal fertilizer dosing schedule.
 *
 * Algorithm:
 *   For each week:
 *     1. Convert the per-ton-of-yield demand into kg/ha by multiplying by yield * irrigation
 *        (and optionally by a soil correction factor < 1 to account for residual fertility).
 *     2. Build a YALPS LP model: minimize total kg/ha while meeting each nutrient demand.
 *     3. Solve. Record per-fertilizer dose, actual nutrients delivered, feasibility.
 *
 * Returns a PrivatePlanResult — must be sanitized before crossing the agent layer.
 */
export function calculateFertilizationPlan(input: OptimizerInput): PrivatePlanResult {
  const perWeek = input.weeks.map((week) => solveWeek(week, input));
  return {
    __brand: 'private',
    cropName: input.cropName,
    resolvedCropFile: input.resolvedCropFile,
    usedGenericFallback: input.usedGenericFallback,
    yieldScaleUsed: input.yieldScale,
    perWeek,
  };
}

function solveWeek(week: CropRequirementWeek, input: OptimizerInput): PrivateWeekPlan {
  const expectedPerHa = computeExpectedPerHa(week, input);
  const { constraints, variables, uncoveredNutrients } = buildLpModel(
    input.fertilizers,
    expectedPerHa,
  );
  if (Object.keys(constraints).length === 0) {
    return buildEmptyWeek(week, expectedPerHa, uncoveredNutrients);
  }
  const model: Model = {
    direction: 'minimize',
    objective: 'total',
    constraints,
    variables,
  };
  const solution = solve(model);
  const doses = collectDoses(solution.variables, input.fertilizers);
  const actualPerHa = computeActualNutrients(doses, input.fertilizers);
  return {
    week: week.week,
    daysAfterSowing: week.daysAfterSowing,
    expectedPerHa,
    actualPerHa,
    doses,
    feasible: solution.status === 'optimal',
    uncoveredNutrients,
  };
}

function computeExpectedPerHa(
  week: CropRequirementWeek,
  input: OptimizerInput,
): Record<NutrientKey, number> {
  const result = {} as Record<NutrientKey, number>;
  for (const key of NUTRIENT_KEYS) {
    const soilFactor = input.soilFactors?.[key as keyof SoilFactors] ?? 1;
    // CSV value is already in kg/ha/day for the reference yield.
    // yieldScale is dimensionless (1.0 = use as-is, >1 = scale up, <1 = scale down).
    result[key] = week[key] * input.yieldScale * input.irrigation * soilFactor;
  }
  return result;
}

function collectDoses(
  resultVariables: ReadonlyArray<readonly [string, number]>,
  fertilizers: readonly FertilizerInput[],
): Record<string, number> {
  const known = new Set(fertilizers.map((f) => f.id));
  const doses: Record<string, number> = {};
  for (const [variableKey, value] of resultVariables) {
    if (!known.has(variableKey)) continue;
    if (value <= 0) continue;
    doses[variableKey] = value;
  }
  return doses;
}

function computeActualNutrients(
  doses: Readonly<Record<string, number>>,
  fertilizers: readonly FertilizerInput[],
): Record<NutrientKey, number> {
  const fertilizerById = new Map(fertilizers.map((f) => [f.id, f]));
  const result = NUTRIENT_KEYS.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<NutrientKey, number>,
  );
  for (const [fertilizerId, dose] of Object.entries(doses)) {
    const fertilizer = fertilizerById.get(fertilizerId);
    if (!fertilizer) continue;
    accumulateNutrientShare(result, dose, fertilizer);
  }
  return result;
}

function accumulateNutrientShare(
  target: Record<NutrientKey, number>,
  dose: number,
  fertilizer: FertilizerInput,
): void {
  for (const nutrient of SOLVER_NUTRIENTS) {
    const share = fertilizer[getNutrientFieldKey(nutrient)] / 100;
    target[nutrient] += dose * share;
  }
}

function buildEmptyWeek(
  week: CropRequirementWeek,
  expectedPerHa: Record<NutrientKey, number>,
  uncoveredNutrients: readonly NutrientKey[],
): PrivateWeekPlan {
  const zeros = NUTRIENT_KEYS.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<NutrientKey, number>,
  );
  return {
    week: week.week,
    daysAfterSowing: week.daysAfterSowing,
    expectedPerHa,
    actualPerHa: zeros,
    doses: {},
    feasible: uncoveredNutrients.length === 0,
    uncoveredNutrients,
  };
}
