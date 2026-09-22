import { formatJobsTableMarkdown } from '../format-jobs-table';
import type { UnitScheduledJob } from '../../../dosage_agent/flowMatchCropTreatment';

function buildJob(overrides: Partial<UnitScheduledJob> = {}): UnitScheduledJob {
  return {
    id: 'job-1',
    jobId: 'grp-1',
    productionUnitId: 'up-1',
    dateOfOpeation: new Date('2026-06-15T00:00:00Z'),
    isVerified: false,
    category: 'TREATMENT' as UnitScheduledJob['category'],
    quantity: 1500,
    unitOfMeasureQuantity: 'L',
    productQuantityTreated: 12,
    unitOfMeasureProductQuantityTreated: 'kg',
    modeOfApplication: 'macchinari',
    avversity: 'Peronospora',
    giustification: null,
    treatedSurface: 29.796,
    isLocalizedTreatment: false,
    userId: null,
    note: null,
    totalDistributedWaterL: null,
    machineId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    stocks: [
      {
        id: 's-1',
        productId: 'p-1',
        quantity: 12,
        unitOfMeasureQuantity: 'kg',
        price: 0,
        unitOfMeasurePrice: 'EUR',
        type: 'OUT',
        product: {
          id: 'p-1',
          name: 'ZOLVIS OTTANTA WG',
          sku: 'ZOL80',
          registrationNumber: '013581',
          category: 'PESTICIDE' as UnitScheduledJob['stocks'][number]['product']['category'],
        },
      },
    ],
    ...overrides,
  };
}

describe('formatJobsTableMarkdown', () => {
  it('renders an empty table when no jobs are provided', () => {
    const md = formatJobsTableMarkdown({ jobsByUnit: new Map() });
    expect(md).toContain('| # | UP | Coltura | Prodotto |');
    expect(md.split('\n').filter((row) => row.startsWith('|')).length).toBe(2);
  });

  it('renders a job row with the product name + dose + surface', () => {
    const jobsByUnit = new Map<string, ReadonlyArray<UnitScheduledJob>>([['up-1', [buildJob()]]]);
    const unitMetaById = new Map([
      [
        'up-1',
        {
          unitProductionId: 'up-1',
          name: 'Campo Vite Nord',
          cropName: 'Vite',
          variety: 'Sangiovese',
        },
      ],
    ]);

    const md = formatJobsTableMarkdown({ jobsByUnit, unitMetaById, groupId: 'grp-1' });

    expect(md).toContain('Gruppo trattamenti');
    expect(md).not.toContain('grp-1');
    expect(md).not.toContain('/archive/jobs/');
    expect(md).toContain('Campo Vite Nord');
    expect(md).toContain('Vite / Sangiovese');
    expect(md).toContain('ZOLVIS OTTANTA WG');
    expect(md).toContain('12 kg');
    // Locale-dependent thousands separator — accept either grouping
    expect(md).toMatch(/1[.,]?500 L/);
    expect(md).toContain('29,796');
    expect(md).toContain('15/06/2026');
    expect(md).toContain('Peronospora');
  });

  it('orders jobs by dateOfOpeation within a unit (ascending)', () => {
    const jobA = buildJob({
      id: 'a',
      dateOfOpeation: new Date('2026-06-20T00:00:00Z'),
      avversity: 'A',
    });
    const jobB = buildJob({
      id: 'b',
      dateOfOpeation: new Date('2026-06-15T00:00:00Z'),
      avversity: 'B',
    });
    const md = formatJobsTableMarkdown({ jobsByUnit: new Map([['up-1', [jobA, jobB]]]) });
    const idxB = md.indexOf('| B |');
    const idxA = md.indexOf('| A |');
    expect(idxB).toBeGreaterThan(-1);
    expect(idxA).toBeGreaterThan(idxB);
  });

  it('falls back to a readable progressive label when unit metadata is missing', () => {
    const md = formatJobsTableMarkdown({
      jobsByUnit: new Map([['41d8705a-2e9f-409d-a3e2-5005817b2857', [buildJob()]]]),
    });
    expect(md).toContain('Unità produttiva 1');
    expect(md).not.toContain('41d8705a');
  });
});
