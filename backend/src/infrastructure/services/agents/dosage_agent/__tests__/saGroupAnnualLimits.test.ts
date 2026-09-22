import {
  accumulateAnnualCounts,
  buildAnnualExceedances,
  flowValidateSAGroupLimits,
  type AnnualBucket,
  type SAGroupTreatmentCount,
} from '../saGroupLimitsValidator';
import type { UnitAllowedProductsWithDosageOutput } from '../flowMatchProductionUnitTreatmentDosage';

function makeCount(overrides: Partial<SAGroupTreatmentCount> = {}): SAGroupTreatmentCount {
  return {
    groupId: 'G1',
    groupName: 'SDHI',
    currentCount: 2,
    maxAllowed: 3,
    period: 'A',
    contributingProducts: [],
    ...overrides,
  };
}

function makeUnit(
  overrides: Partial<UnitAllowedProductsWithDosageOutput> = {},
): UnitAllowedProductsWithDosageOutput {
  return {
    unitProductionId: 'u1',
    seasonYear: 2026,
    products: [],
    jobs: [],
    ...overrides,
  } as UnitAllowedProductsWithDosageOutput;
}

function groupMap(count: SAGroupTreatmentCount): Map<string, SAGroupTreatmentCount> {
  return new Map([[`${count.groupId}|${count.groupName}`, count]]);
}

describe('SA-group annual aggregation', () => {
  it('flags an annual cap exceeded across cycles when no single cycle exceeds it', () => {
    const inputAcc = new Map<string, AnnualBucket>();
    accumulateAnnualCounts(inputAcc, makeUnit({ seasonYear: 2026 }), groupMap(makeCount()));
    accumulateAnnualCounts(inputAcc, makeUnit({ seasonYear: 2026 }), groupMap(makeCount()));
    const actual = buildAnnualExceedances(inputAcc);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toMatchObject({
      groupName: 'SDHI',
      unitProductionId: 'u1',
      seasonYear: 2026,
      total: 4,
      maxAllowed: 3,
    });
  });

  it('does not flag per-cycle (period "C") groups', () => {
    const inputAcc = new Map<string, AnnualBucket>();
    accumulateAnnualCounts(inputAcc, makeUnit(), groupMap(makeCount({ period: 'C' })));
    accumulateAnnualCounts(inputAcc, makeUnit(), groupMap(makeCount({ period: 'C' })));
    expect(inputAcc.size).toBe(0);
    expect(buildAnnualExceedances(inputAcc)).toHaveLength(0);
  });

  it('does not flag a single-cycle breach (handled by per-cycle zeroing)', () => {
    const inputAcc = new Map<string, AnnualBucket>();
    accumulateAnnualCounts(
      inputAcc,
      makeUnit(),
      groupMap(makeCount({ currentCount: 4, maxAllowed: 3 })),
    );
    // maxPerCycle (4) > maxAllowed (3) → excluded from annual exceedances
    expect(buildAnnualExceedances(inputAcc)).toHaveLength(0);
  });

  it('does not aggregate across different seasons', () => {
    const inputAcc = new Map<string, AnnualBucket>();
    accumulateAnnualCounts(inputAcc, makeUnit({ seasonYear: 2026 }), groupMap(makeCount()));
    accumulateAnnualCounts(inputAcc, makeUnit({ seasonYear: 2027 }), groupMap(makeCount()));
    expect(buildAnnualExceedances(inputAcc)).toHaveLength(0);
  });

  it('skips zero-count groups', () => {
    const inputAcc = new Map<string, AnnualBucket>();
    accumulateAnnualCounts(inputAcc, makeUnit(), groupMap(makeCount({ currentCount: 0 })));
    expect(inputAcc.size).toBe(0);
  });

  it('aggregates units missing seasonYear into one bucket (seasonYear null)', () => {
    const inputAcc = new Map<string, AnnualBucket>();
    accumulateAnnualCounts(inputAcc, makeUnit({ seasonYear: undefined }), groupMap(makeCount()));
    accumulateAnnualCounts(inputAcc, makeUnit({ seasonYear: undefined }), groupMap(makeCount()));
    const actual = buildAnnualExceedances(inputAcc);
    expect(actual).toHaveLength(1);
    expect(actual[0].seasonYear).toBeNull();
  });
});

describe('flowValidateSAGroupLimits — RO-RO + missing data', () => {
  it('returns {units, diagnostics} and reports units without normalized data', async () => {
    const inputUnit = makeUnit({ unitProductionId: 'u-missing' });
    const actual = await flowValidateSAGroupLimits({ units: [inputUnit], normalizedUnits: [] });
    expect(actual.units).toHaveLength(1);
    expect(actual.diagnostics.missingDataUnitIds).toContain('u-missing');
    expect(actual.diagnostics.annualExceedances).toEqual([]);
  });
});
