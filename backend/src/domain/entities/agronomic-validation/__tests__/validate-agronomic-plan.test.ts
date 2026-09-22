import { validateAgronomicPlan } from '../validate-agronomic-plan';
import type {
  AgronomicConstrainedTreatment,
  AgronomicConstrainedUnit,
  AgronomicPlanInput,
} from '../agronomic-violation.types';

function buildTreatment(
  overrides: Partial<AgronomicConstrainedTreatment> = {},
): AgronomicConstrainedTreatment {
  return {
    applicationDate: '2026-06-01T00:00:00.000Z',
    doseValue: 1.0,
    doseUnit: 'L/ha',
    epoca: null,
    labelDoseMin: 0.8,
    labelDoseMax: 1.2,
    labelPhiDays: null,
    labelMinIntervalDays: null,
    labelNMaxApplications: null,
    labelNMaxApplicationsUm: null,
    doseRowConfidence: 1,
    ...overrides,
  };
}

interface ProductFixtureOverrides {
  readonly isRevoked?: boolean;
  readonly revokedReason?: string | null;
  readonly fasceRispettoAcqua?: string | null;
  readonly fasceRispettoColture?: string | null;
  readonly bufferAreaApplied?: boolean;
}

function buildPlan(
  treatments: AgronomicConstrainedTreatment | ReadonlyArray<AgronomicConstrainedTreatment>,
  unitOverrides: Partial<AgronomicConstrainedUnit> = {},
  productOverrides: ProductFixtureOverrides = {},
): AgronomicPlanInput {
  const list = Array.isArray(treatments) ? treatments : [treatments];
  const unit: AgronomicConstrainedUnit = {
    productionUnitId: 'unit-1',
    cropName: 'Vite',
    adversity: null,
    harvestingDate: null,
    products: [
      {
        productName: 'Prodotto X',
        registrationNumber: '12345',
        isRevoked: productOverrides.isRevoked ?? false,
        revokedReason: productOverrides.revokedReason ?? null,
        fasceRispettoAcqua: productOverrides.fasceRispettoAcqua ?? null,
        fasceRispettoColture: productOverrides.fasceRispettoColture ?? null,
        bufferAreaApplied: productOverrides.bufferAreaApplied ?? false,
        treatments: list,
      },
    ],
    ...unitOverrides,
  };
  return { units: [unit], weatherEvaluated: true };
}

describe('validateAgronomicPlan — dose max', () => {
  it('flags a dose above the label maximum as BLOCKING', () => {
    const inputPlan = buildPlan(buildTreatment({ doseValue: 1.8, labelDoseMax: 1.2 }));
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.blockingCount).toBe(1);
    expect(actual.violations[0]?.code).toBe('DOSE_ABOVE_LABEL_MAX');
    expect(actual.violations[0]?.severity).toBe('BLOCKING');
  });

  it('does not flag a dose within the label range', () => {
    const inputPlan = buildPlan(buildTreatment({ doseValue: 1.0 }));
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations).toHaveLength(0);
  });

  it('flags a dose below the label minimum as WARNING', () => {
    const inputPlan = buildPlan(buildTreatment({ doseValue: 0.5, labelDoseMin: 0.8 }));
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.blockingCount).toBe(0);
    expect(actual.warningCount).toBe(1);
    expect(actual.violations[0]?.code).toBe('DOSE_BELOW_LABEL_MIN');
  });

  it('flags an unresolved dose row as BLOCKING and skips the max comparison', () => {
    const inputPlan = buildPlan(
      buildTreatment({ doseValue: 5.0, labelDoseMax: 1.2, doseRowConfidence: 0.3 }),
    );
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.blockingCount).toBe(1);
    expect(actual.violations[0]?.code).toBe('DOSE_ROW_UNRESOLVED');
  });

  it('tolerates tiny float overshoot within tolerance', () => {
    const inputPlan = buildPlan(buildTreatment({ doseValue: 1.2005, labelDoseMax: 1.2 }));
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations).toHaveLength(0);
  });
});

describe('validateAgronomicPlan — PHI', () => {
  it('flags an application later than (harvest − PHI) as BLOCKING', () => {
    const inputPlan = buildPlan(
      buildTreatment({ applicationDate: '2026-06-25T00:00:00.000Z', labelPhiDays: 14 }),
      { harvestingDate: '2026-06-30T00:00:00.000Z' },
    );
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations.some((v) => v.code === 'PHI_VIOLATION')).toBe(true);
    expect(actual.blockingCount).toBeGreaterThanOrEqual(1);
  });

  it('does not flag an application that respects the PHI', () => {
    const inputPlan = buildPlan(
      buildTreatment({ applicationDate: '2026-06-10T00:00:00.000Z', labelPhiDays: 14 }),
      { harvestingDate: '2026-06-30T00:00:00.000Z' },
    );
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations.some((v) => v.code === 'PHI_VIOLATION')).toBe(false);
  });

  it('skips the PHI check for post-harvest applications', () => {
    const inputPlan = buildPlan(
      buildTreatment({
        applicationDate: '2026-07-15T00:00:00.000Z',
        labelPhiDays: 14,
        epoca: 'Post-raccolta',
      }),
      { harvestingDate: '2026-06-30T00:00:00.000Z' },
    );
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations.some((v) => v.code === 'PHI_VIOLATION')).toBe(false);
  });

  it('skips the PHI check when the harvest date is unknown', () => {
    const inputPlan = buildPlan(
      buildTreatment({ applicationDate: '2026-06-29T00:00:00.000Z', labelPhiDays: 14 }),
      { harvestingDate: null },
    );
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations.some((v) => v.code === 'PHI_VIOLATION')).toBe(false);
  });
});

describe('validateAgronomicPlan — revoked + policy', () => {
  it('flags a revoked product and skips its dose checks', () => {
    const inputPlan = buildPlan(
      buildTreatment({ doseValue: 9.9, labelDoseMax: 1.2 }),
      {},
      { isRevoked: true, revokedReason: 'Revocato dal 2025-01-01' },
    );
    const actual = validateAgronomicPlan({ plan: inputPlan });
    const codes = actual.violations.map((v) => v.code);
    expect(codes).toContain('REVOKED_PRODUCT');
    expect(codes).not.toContain('DOSE_ABOVE_LABEL_MAX');
  });

  it('respects a severity override from policy', () => {
    const inputPlan = buildPlan(
      buildTreatment({ applicationDate: '2026-06-29T00:00:00.000Z', labelPhiDays: 14 }),
      { harvestingDate: '2026-06-30T00:00:00.000Z' },
    );
    const actual = validateAgronomicPlan({
      plan: inputPlan,
      policy: { severityOverrides: { PHI_VIOLATION: 'WARNING' } },
    });
    const phi = actual.violations.find((v) => v.code === 'PHI_VIOLATION');
    expect(phi?.severity).toBe('WARNING');
    expect(actual.blockingCount).toBe(0);
  });

  it('reports the P0 checks run for transparency', () => {
    const actual = validateAgronomicPlan({ plan: buildPlan(buildTreatment()) });
    expect(actual.checksRun).toEqual(
      expect.arrayContaining(['DOSE_ABOVE_LABEL_MAX', 'PHI_VIOLATION', 'REVOKED_PRODUCT']),
    );
  });
});

describe('validateAgronomicPlan — min interval', () => {
  it('flags two applications closer than the label minimum interval', () => {
    const inputPlan = buildPlan([
      buildTreatment({ applicationDate: '2026-05-01T00:00:00.000Z', labelMinIntervalDays: 14 }),
      buildTreatment({ applicationDate: '2026-05-10T00:00:00.000Z', labelMinIntervalDays: 14 }),
    ]);
    const actual = validateAgronomicPlan({ plan: inputPlan });
    const interval = actual.violations.find((v) => v.code === 'MIN_INTERVAL_VIOLATION');
    expect(interval?.severity).toBe('WARNING');
    expect(interval?.observed).toBe(9);
  });

  it('does not flag applications that respect the minimum interval', () => {
    const inputPlan = buildPlan([
      buildTreatment({ applicationDate: '2026-05-01T00:00:00.000Z', labelMinIntervalDays: 7 }),
      buildTreatment({ applicationDate: '2026-05-10T00:00:00.000Z', labelMinIntervalDays: 7 }),
    ]);
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations.some((v) => v.code === 'MIN_INTERVAL_VIOLATION')).toBe(false);
  });
});

describe('validateAgronomicPlan — n max applications', () => {
  it('flags more applications than the label allows for the resolved row', () => {
    const inputPlan = buildPlan([
      buildTreatment({ applicationDate: '2026-05-01T00:00:00.000Z', labelNMaxApplications: 2 }),
      buildTreatment({ applicationDate: '2026-05-20T00:00:00.000Z', labelNMaxApplications: 2 }),
      buildTreatment({ applicationDate: '2026-06-10T00:00:00.000Z', labelNMaxApplications: 2 }),
    ]);
    const actual = validateAgronomicPlan({ plan: inputPlan });
    const nMax = actual.violations.find((v) => v.code === 'N_MAX_APPLICATIONS_EXCEEDED');
    expect(nMax?.severity).toBe('WARNING');
    expect(nMax?.observed).toBe(3);
    expect(nMax?.limit).toBe(2);
  });

  it('uses the most restrictive resolved cap across rows', () => {
    const inputPlan = buildPlan([
      buildTreatment({ applicationDate: '2026-05-01T00:00:00.000Z', labelNMaxApplications: 6 }),
      buildTreatment({ applicationDate: '2026-05-20T00:00:00.000Z', labelNMaxApplications: 1 }),
    ]);
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations.some((v) => v.code === 'N_MAX_APPLICATIONS_EXCEEDED')).toBe(true);
  });
});

describe('validateAgronomicPlan — buffer zones', () => {
  it('flags a metric buffer zone that was not applied', () => {
    const inputPlan = buildPlan(
      buildTreatment(),
      {},
      { fasceRispettoAcqua: '20 m da corpi idrici' },
    );
    const actual = validateAgronomicPlan({ plan: inputPlan });
    const buffer = actual.violations.find((v) => v.code === 'BUFFER_ZONE_NOT_APPLIED');
    expect(buffer?.severity).toBe('WARNING');
  });

  it('does not flag buffer text without a metric distance', () => {
    const inputPlan = buildPlan(buildTreatment(), {}, { fasceRispettoColture: 'non applicabile' });
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations.some((v) => v.code === 'BUFFER_ZONE_NOT_APPLIED')).toBe(false);
  });

  it('does not flag when the buffer area was applied upstream', () => {
    const inputPlan = buildPlan(
      buildTreatment(),
      {},
      { fasceRispettoAcqua: '10 m', bufferAreaApplied: true },
    );
    const actual = validateAgronomicPlan({ plan: inputPlan });
    expect(actual.violations.some((v) => v.code === 'BUFFER_ZONE_NOT_APPLIED')).toBe(false);
  });
});
