import { sanitizePlan } from '../plan-sanitizer';
import { PrivatePlanResult } from '../types';

const FORBIDDEN_KEYS = ['expectedPerHa', 'actualPerHa', 'yieldScaleUsed', 'resolvedCropFile'];

const baseInput: PrivatePlanResult = {
  __brand: 'private',
  cropName: 'pomodoro',
  resolvedCropFile: 'pomodoro.csv',
  usedGenericFallback: false,
  yieldScaleUsed: 1,
  perWeek: [
    {
      week: 1,
      daysAfterSowing: 1,
      expectedPerHa: { N: 100, P2O5: 50, K2O: 80, MgO: 20, CaO: 60, B: 5 },
      actualPerHa: { N: 100, P2O5: 50, K2O: 80, MgO: 20, CaO: 60, B: 5 },
      doses: { 'fert-1': 250 },
      feasible: true,
      uncoveredNutrients: [],
    },
    {
      week: 2,
      daysAfterSowing: 8,
      expectedPerHa: { N: 110, P2O5: 55, K2O: 85, MgO: 22, CaO: 65, B: 6 },
      actualPerHa: { N: 121, P2O5: 49.5, K2O: 85, MgO: 22, CaO: 65, B: 6 },
      doses: { 'fert-1': 240, 'fert-2': 30 },
      feasible: true,
      uncoveredNutrients: [],
    },
  ],
};

describe('sanitizePlan', () => {
  it('produces a PublicPlanResult with the public brand', () => {
    const out = sanitizePlan(baseInput);
    expect(out.__brand).toBe('public');
    expect(out.cropName).toBe('pomodoro');
    expect(out.usedGenericFallback).toBe(false);
  });

  it('exposes yieldScale (dimensionless ratio) in the public result', () => {
    const out = sanitizePlan({ ...baseInput, yieldScaleUsed: 0.85 });
    expect(out.yieldScale).toBe(0.85);
  });

  it('preserves yieldScale = 1 (default neutral) when no scaling was applied', () => {
    const out = sanitizePlan({ ...baseInput, yieldScaleUsed: 1 });
    expect(out.yieldScale).toBe(1);
  });

  it('strips raw expected, actual, yield, and resolved file from the output', () => {
    const out = sanitizePlan(baseInput);
    const serialized = JSON.stringify(out);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('aggregates total doses across all weeks per fertilizer', () => {
    const out = sanitizePlan(baseInput);
    expect(out.totalDoses).toEqual({ 'fert-1': 490, 'fert-2': 30 });
  });

  it('emits zero delta when actual matches expected', () => {
    const out = sanitizePlan(baseInput);
    expect(out.perWeek[0].deltaPercents.N).toBeCloseTo(0, 5);
    expect(out.perWeek[0].deltaPercents.P2O5).toBeCloseTo(0, 5);
  });

  it('emits a positive delta when over-supplied and negative when under-supplied', () => {
    const out = sanitizePlan(baseInput);
    expect(out.perWeek[1].deltaPercents.N).toBeCloseTo(10, 1);
    expect(out.perWeek[1].deltaPercents.P2O5).toBeCloseTo(-10, 1);
  });

  it('marks feasibility as false when any week is infeasible', () => {
    const input: PrivatePlanResult = {
      ...baseInput,
      perWeek: [
        { ...baseInput.perWeek[0], feasible: false, uncoveredNutrients: ['MgO'] },
        baseInput.perWeek[1],
      ],
    };
    const out = sanitizePlan(input);
    expect(out.feasible).toBe(false);
    expect(out.uncoveredNutrients).toContain('MgO');
  });
});
