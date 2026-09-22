import { buildProposalSummary } from '../proposal-summary';
import { clearWorkingMemory, updateWorkingMemory } from '../working-memory';
import type { WorkingMemory } from '../type/state';

const PRODUCT_A = {
  name: 'Karate Zeon',
  regNumber: '12345',
  trattamenti: [{ date: '2026-04-10' }, { date: '2026-05-02' }],
};

const PRODUCT_B = {
  name: 'Decis Evo',
  regNumber: '67890',
  trattamenti: [{ date: '2026-04-15' }],
};

const PRODUCT_NO_TREATMENTS = {
  name: 'Confidor',
  regNumber: '11111',
  trattamenti: [],
};

type DosageResults = NonNullable<WorkingMemory['dosageResults']>;
type ComplianceResult = NonNullable<WorkingMemory['complianceResult']>;

function seedDosageResults(threadId: string, units: unknown[]): void {
  updateWorkingMemory(threadId, {
    dosageResults: units as unknown as DosageResults,
  });
}

describe('proposal-summary', () => {
  afterEach(() => {
    clearWorkingMemory('thread-summary-1');
    clearWorkingMemory('thread-summary-2');
    clearWorkingMemory('thread-summary-empty');
    clearWorkingMemory('thread-summary-violations');
  });

  it('returns undefined for tools without summary support', () => {
    seedDosageResults('thread-summary-1', [
      {
        unitProductionId: 'unit-1',
        cropName: 'Frumento tenero',
        products: [PRODUCT_A],
      },
    ]);

    expect(buildProposalSummary('thread-summary-1', 'update_production_units')).toBeUndefined();
  });

  it('returns undefined when working memory is empty', () => {
    expect(buildProposalSummary('thread-summary-empty', 'create_treatment_jobs')).toBeUndefined();
  });

  it('counts treatments across units and products, skipping zero-treatment products', () => {
    seedDosageResults('thread-summary-1', [
      {
        unitProductionId: 'unit-1',
        cropName: 'Frumento tenero',
        variety: 'Bologna',
        areaHa: 4.5,
        products: [PRODUCT_A, PRODUCT_NO_TREATMENTS],
      },
      {
        unitProductionId: 'unit-2',
        cropName: 'Mais',
        products: [PRODUCT_B],
      },
    ]);

    const summary = buildProposalSummary('thread-summary-1', 'create_treatment_jobs');

    expect(summary).toEqual({
      tool: 'create_treatment_jobs',
      totalJobs: 3,
      unitsCount: 2,
      complianceViolationsCount: 0,
      hasComplianceViolations: false,
      units: [
        {
          productionUnitId: 'unit-1',
          cropName: 'Frumento tenero',
          variety: 'Bologna',
          areaHa: 4.5,
          jobCount: 2,
          products: [
            { productName: 'Karate Zeon', registrationNumber: '12345', treatmentCount: 2 },
          ],
        },
        {
          productionUnitId: 'unit-2',
          cropName: 'Mais',
          variety: undefined,
          areaHa: undefined,
          jobCount: 1,
          products: [{ productName: 'Decis Evo', registrationNumber: '67890', treatmentCount: 1 }],
        },
      ],
    });
  });

  it('excludes units with no treatments at all', () => {
    seedDosageResults('thread-summary-2', [
      {
        unitProductionId: 'unit-only-empty',
        cropName: 'Soia',
        products: [PRODUCT_NO_TREATMENTS],
      },
      {
        unitProductionId: 'unit-with-jobs',
        cropName: 'Mais',
        products: [PRODUCT_B],
      },
    ]);

    const summary = buildProposalSummary('thread-summary-2', 'create_treatment_jobs');

    expect(summary?.unitsCount).toBe(1);
    expect(summary?.units[0].productionUnitId).toBe('unit-with-jobs');
  });

  it('surfaces compliance violations count', () => {
    const violations = [
      { ruleId: 'r1', message: 'v1' },
      { ruleId: 'r2', message: 'v2' },
    ] as unknown as ComplianceResult['violations'];

    updateWorkingMemory('thread-summary-violations', {
      dosageResults: [
        {
          unitProductionId: 'unit-1',
          cropName: 'Frumento tenero',
          products: [PRODUCT_A],
        },
      ] as unknown as DosageResults,
      complianceResult: { violations },
    });

    const summary = buildProposalSummary('thread-summary-violations', 'create_treatment_jobs');

    expect(summary?.complianceViolationsCount).toBe(2);
    expect(summary?.hasComplianceViolations).toBe(true);
  });
});
