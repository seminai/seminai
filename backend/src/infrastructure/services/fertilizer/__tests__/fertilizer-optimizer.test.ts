import { calculateFertilizationPlan } from '../fertilizer-optimizer';
import {
  CropRequirementWeek,
  FertilizerInput,
} from '../../../../domain/entities/fertilizer-plan/types';

const urea: FertilizerInput = {
  id: 'urea',
  name: 'Urea 46%',
  nitrogen: 46,
  phosphorus: 0,
  potassium: 0,
  magnesium: 0,
  calcium: 0,
  sulfur: 0,
  boron: 0,
};

const map: FertilizerInput = {
  id: 'map',
  name: 'MAP 11-52-0',
  nitrogen: 11,
  phosphorus: 52,
  potassium: 0,
  magnesium: 0,
  calcium: 0,
  sulfur: 0,
  boron: 0,
};

const muriate: FertilizerInput = {
  id: 'muriate',
  name: 'Muriate of potash',
  nitrogen: 0,
  phosphorus: 0,
  potassium: 60,
  magnesium: 0,
  calcium: 0,
  sulfur: 0,
  boron: 0,
};

const week: CropRequirementWeek = {
  week: 1,
  daysAfterSowing: 1,
  N: 1, // CSV value is already in kg/ha for the reference yield
  P2O5: 0.5,
  K2O: 1.2,
  MgO: 0,
  CaO: 0,
  B: 0,
};

describe('calculateFertilizationPlan', () => {
  it('produces a feasible plan when fertilizers cover all required nutrients (default scale = 1)', () => {
    const result = calculateFertilizationPlan({
      cropName: 'pomodoro',
      resolvedCropFile: 'pomodoro.csv',
      usedGenericFallback: false,
      fertilizers: [urea, map, muriate],
      weeks: [week],
      yieldScale: 1,
      irrigation: 1,
    });
    const w = result.perWeek[0];
    expect(w.feasible).toBe(true);
    expect(w.uncoveredNutrients).toEqual([]);
    // With yieldScale=1 the expected demand equals the raw CSV value (kg/ha).
    expect(w.actualPerHa.N).toBeGreaterThanOrEqual(week.N - 1e-6);
    expect(w.actualPerHa.P2O5).toBeGreaterThanOrEqual(week.P2O5 - 1e-6);
    expect(w.actualPerHa.K2O).toBeGreaterThanOrEqual(week.K2O - 1e-6);
  });

  it('scales the demand linearly with yieldScale', () => {
    const result = calculateFertilizationPlan({
      cropName: 'pomodoro',
      resolvedCropFile: 'pomodoro.csv',
      usedGenericFallback: false,
      fertilizers: [urea, map, muriate],
      weeks: [week],
      yieldScale: 2,
      irrigation: 1,
    });
    const w = result.perWeek[0];
    expect(w.feasible).toBe(true);
    // Doubling yieldScale doubles the expected demand.
    expect(w.actualPerHa.N).toBeGreaterThanOrEqual(week.N * 2 - 1e-6);
    expect(w.actualPerHa.K2O).toBeGreaterThanOrEqual(week.K2O * 2 - 1e-6);
  });

  it('records the yieldScale used in the private result for debugging', () => {
    const result = calculateFertilizationPlan({
      cropName: 'pomodoro',
      resolvedCropFile: 'pomodoro.csv',
      usedGenericFallback: false,
      fertilizers: [urea, map, muriate],
      weeks: [week],
      yieldScale: 0.75,
      irrigation: 1,
    });
    expect(result.yieldScaleUsed).toBe(0.75);
  });

  it('marks the plan as infeasible when no fertilizer provides a required nutrient', () => {
    const result = calculateFertilizationPlan({
      cropName: 'pomodoro',
      resolvedCropFile: 'pomodoro.csv',
      usedGenericFallback: false,
      fertilizers: [urea, map],
      weeks: [week],
      yieldScale: 1,
      irrigation: 1,
    });
    const w = result.perWeek[0];
    expect(w.uncoveredNutrients).toContain('K2O');
  });

  it('ignores zero-demand weeks (no constraints, dose is empty)', () => {
    const zeroWeek: CropRequirementWeek = {
      week: 1,
      daysAfterSowing: 1,
      N: 0,
      P2O5: 0,
      K2O: 0,
      MgO: 0,
      CaO: 0,
      B: 0,
    };
    const result = calculateFertilizationPlan({
      cropName: 'pomodoro',
      resolvedCropFile: 'pomodoro.csv',
      usedGenericFallback: false,
      fertilizers: [urea, map, muriate],
      weeks: [zeroWeek],
      yieldScale: 1,
      irrigation: 1,
    });
    expect(result.perWeek[0].doses).toEqual({});
    expect(result.perWeek[0].feasible).toBe(true);
  });
});
