import { buildDeltaPercents } from './nutrient-comparison';
import {
  NUTRIENT_KEYS,
  PrivatePlanResult,
  PrivateWeekPlan,
  PublicPlanResult,
  PublicWeekPlan,
} from './types';

/**
 * SOLE authorized funnel from PrivatePlanResult to PublicPlanResult.
 *
 * Strips raw expected requirements, raw yield, raw demand rows, and the per-week
 * `actualPerHa` map (which combined with doses could let a caller back out the
 * requirement curves). Keeps:
 *   - per-week doses per fertilizer
 *   - per-week relative deltas (percentages — non-invertible without the absolute)
 *   - feasibility diagnostics
 *   - the boolean `usedGenericFallback` flag
 *
 * The agent layer must consume only the result of this function.
 */
export function sanitizePlan(input: PrivatePlanResult): PublicPlanResult {
  const perWeek = input.perWeek.map((week) => sanitizeWeek(week));
  const totalDoses = aggregateDoses(input.perWeek);
  const feasible = input.perWeek.every((w) => w.feasible);
  const uncoveredNutrients = collectUniqueUncovered(input.perWeek);
  return {
    __brand: 'public',
    cropName: input.cropName,
    usedGenericFallback: input.usedGenericFallback,
    yieldScale: input.yieldScaleUsed,
    perWeek,
    totalDoses,
    feasible,
    uncoveredNutrients,
  };
}

function sanitizeWeek(week: PrivateWeekPlan): PublicWeekPlan {
  return {
    week: week.week,
    daysAfterSowing: week.daysAfterSowing,
    doses: { ...week.doses },
    deltaPercents: buildDeltaPercents(week.expectedPerHa, week.actualPerHa, NUTRIENT_KEYS),
    feasible: week.feasible,
    uncoveredNutrients: week.uncoveredNutrients,
  };
}

function aggregateDoses(weeks: readonly PrivateWeekPlan[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const week of weeks) {
    for (const [fertilizerId, dose] of Object.entries(week.doses)) {
      totals[fertilizerId] = (totals[fertilizerId] ?? 0) + dose;
    }
  }
  return totals;
}

function collectUniqueUncovered(weeks: readonly PrivateWeekPlan[]) {
  const set = new Set<PrivateWeekPlan['uncoveredNutrients'][number]>();
  for (const week of weeks) {
    for (const nutrient of week.uncoveredNutrients) set.add(nutrient);
  }
  return [...set];
}
