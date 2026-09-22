import { Constraint, Coefficients } from 'yalps';
import {
  FertilizerInput,
  NutrientKey,
  SOLVER_NUTRIENTS,
} from '../../../domain/entities/fertilizer-plan/types';

type NumericFertilizerField =
  | 'nitrogen'
  | 'phosphorus'
  | 'potassium'
  | 'magnesium'
  | 'calcium'
  | 'sulfur'
  | 'boron';

const NUTRIENT_TO_FERTILIZER_FIELD: Readonly<Record<NutrientKey, NumericFertilizerField>> = {
  N: 'nitrogen',
  P2O5: 'phosphorus',
  K2O: 'potassium',
  MgO: 'magnesium',
  CaO: 'calcium',
  B: 'boron',
};

export interface BuiltModel {
  readonly constraints: Record<string, Constraint>;
  readonly variables: Record<string, Coefficients>;
  readonly uncoveredNutrients: readonly NutrientKey[];
}

/**
 * Builds the YALPS LP model for one weekly demand vs the available fertilizer mix.
 *
 * - Variables: one per fertilizer; the value is the dose in kg/ha.
 * - Each variable contributes `nutrient% / 100` to the corresponding nutrient
 *   row, plus 1.0 to a synthetic "total" row used as the minimization objective.
 * - Constraints: greater-or-equal on each nutrient with positive demand AND at
 *   least one fertilizer providing it. Nutrients required but not provided by
 *   any fertilizer are reported back as `uncoveredNutrients` (the LP would be
 *   infeasible if we kept those constraints).
 */
export function buildLpModel(
  fertilizers: readonly FertilizerInput[],
  weeklyDemand: Readonly<Record<NutrientKey, number>>,
): BuiltModel {
  const supportedNutrients = collectSupportedNutrients(fertilizers);
  const uncoveredNutrients = SOLVER_NUTRIENTS.filter(
    (key) => weeklyDemand[key] > 0 && !supportedNutrients.has(key),
  );
  const constraints: Record<string, Constraint> = {};
  for (const nutrient of SOLVER_NUTRIENTS) {
    if (weeklyDemand[nutrient] > 0 && supportedNutrients.has(nutrient)) {
      constraints[nutrient] = { min: weeklyDemand[nutrient] };
    }
  }
  const variables: Record<string, Coefficients> = {};
  for (const fertilizer of fertilizers) {
    variables[fertilizer.id] = buildVariableCoefficients(fertilizer);
  }
  return { constraints, variables, uncoveredNutrients };
}

function buildVariableCoefficients(fertilizer: FertilizerInput): Coefficients {
  const coeffs: Record<string, number> = { total: 1 };
  for (const nutrient of SOLVER_NUTRIENTS) {
    coeffs[nutrient] = fertilizer[NUTRIENT_TO_FERTILIZER_FIELD[nutrient]] / 100;
  }
  return coeffs;
}

function collectSupportedNutrients(
  fertilizers: readonly FertilizerInput[],
): ReadonlySet<NutrientKey> {
  const set = new Set<NutrientKey>();
  for (const fertilizer of fertilizers) {
    for (const nutrient of SOLVER_NUTRIENTS) {
      if (fertilizer[NUTRIENT_TO_FERTILIZER_FIELD[nutrient]] > 0) set.add(nutrient);
    }
  }
  return set;
}

export function getNutrientFieldKey(nutrient: NutrientKey): NumericFertilizerField {
  return NUTRIENT_TO_FERTILIZER_FIELD[nutrient];
}
