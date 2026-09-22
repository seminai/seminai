import { clearCropRequirementsCache, loadCropRequirements } from '../crop-requirements-loader';

describe('crop-requirements-loader (Phase D — boron unit conversion)', () => {
  beforeEach(() => {
    clearCropRequirementsCache();
  });

  it('converts the B column from grams/ha to kg/ha at parse time', async () => {
    const { weeks, resolved } = await loadCropRequirements('pomodoro');
    expect(resolved.usedGenericFallback).toBe(false);
    expect(weeks.length).toBeGreaterThan(0);

    // Tomato CSV declares "B Grammi/Ha". Each daily row is ~5 g/ha; aggregated
    // weekly that means ~35 g/ha = 0.035 kg/ha. After Phase D conversion the
    // value MUST be in the kg range (< 1), not the gram range (10–100).
    const firstWeek = weeks[0];
    expect(firstWeek.B).toBeGreaterThan(0);
    expect(firstWeek.B).toBeLessThan(1);

    // Macros stay in kg/ha (no conversion). Tomato week 1 N is several kg/ha.
    expect(firstWeek.N).toBeGreaterThan(1);
  });

  it('keeps macro-nutrient values comparable to boron (same unit, different magnitude)', async () => {
    const { weeks } = await loadCropRequirements('pomodoro');
    const firstWeek = weeks[0];
    // After conversion, macros should be at least an order of magnitude bigger
    // than B (kg/ha vs kg/ha; macros are tens of kg, B is fractional).
    expect(firstWeek.N / Math.max(firstWeek.B, 1e-9)).toBeGreaterThan(10);
    expect(firstWeek.K2O / Math.max(firstWeek.B, 1e-9)).toBeGreaterThan(10);
  });
});
