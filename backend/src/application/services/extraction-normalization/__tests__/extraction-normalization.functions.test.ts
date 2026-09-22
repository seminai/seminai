import {
  buildGroupingKey,
  dedupExtractedFields,
  groupRowsIntoProductionUnits,
} from '../extraction-normalization.functions';
import type { FieldExtracted } from '../../../../infrastructure/services/agents/dosage_agent_react/tools/file-extraction-types';

describe('dedupExtractedFields', () => {
  it('merges duplicates by cadastral key and assigns stable tempIds', () => {
    const inputFields: FieldExtracted[] = [
      {
        name: 'Vigna A',
        foglio: '12',
        particella: '34',
        sezione: 'A',
        comune: 'Verona',
        usiSuolo: ['Vite'],
        sauHa: 1.5,
      },
      {
        name: 'Vigna A bis',
        foglio: '12',
        particella: '34',
        sezione: 'A',
        comune: 'Verona',
        usiSuolo: ['Vite da vino'],
        sauHa: 1.7,
      },
      {
        name: 'Oliveto',
        foglio: '8',
        particella: '20',
        comune: 'Lazise',
        usiSuolo: ['Olivo'],
        sauHa: 2.0,
      },
    ];

    const actualA = dedupExtractedFields(inputFields);
    const actualB = dedupExtractedFields(inputFields);

    expect(actualA).toHaveLength(2);
    expect(actualA.map((field) => field.tempId)).toEqual(['ext-fld-001', 'ext-fld-002']);
    const mergedVigna = actualA.find((field) => field.foglio === '12');
    expect(mergedVigna?.usiSuolo).toEqual(expect.arrayContaining(['Vite', 'Vite da vino']));
    expect(mergedVigna?.sauHa).toBeGreaterThanOrEqual(1.7);
    expect(JSON.stringify(actualA)).toBe(JSON.stringify(actualB));
  });

  it('falls back to comune + name when cadastral key is missing', () => {
    const inputFields: FieldExtracted[] = [
      { name: 'Lotto Nord', comune: 'Mantova' },
      { name: 'Lotto Nord', comune: 'Mantova' },
      { name: 'Lotto Sud', comune: 'Mantova' },
    ];

    const actual = dedupExtractedFields(inputFields);

    expect(actual).toHaveLength(2);
  });
});

describe('buildGroupingKey', () => {
  it('returns null when essential parts are missing', () => {
    expect(buildGroupingKey({ cropName: '', comune: 'Verona', foglio: '12' })).toBeNull();
    expect(buildGroupingKey({ cropName: 'Vite', comune: '', foglio: '12' })).toBeNull();
    expect(buildGroupingKey({ cropName: 'Vite', comune: 'Verona', foglio: '' })).toBeNull();
  });

  it('normalizes case and trims values; assigns primary/secondary uso suolo', () => {
    const actual = buildGroupingKey({
      cropName: '  Vite  ',
      comune: 'VERONA',
      foglio: '12',
      usiSuolo: ['Vite Da Vino', 'Seminativo'],
    });

    expect(actual).toEqual({
      cropName: 'vite',
      comune: 'verona',
      foglio: '12',
      usoSuoloPrimario: 'vite da vino',
      usoSuoloSecondario: 'seminativo',
    });
  });

  it('leaves secondary uso suolo null when only one is present', () => {
    const actual = buildGroupingKey({
      cropName: 'Vite',
      comune: 'Verona',
      foglio: '12',
      usiSuolo: ['Vite'],
    });

    expect(actual?.usoSuoloSecondario).toBeNull();
  });
});

describe('groupRowsIntoProductionUnits', () => {
  const inputFields: FieldExtracted[] = [
    {
      name: 'P1',
      foglio: '12',
      particella: '34',
      comune: 'Verona',
      usiSuolo: ['Vite'],
      sauHa: 2,
    },
    {
      name: 'P2',
      foglio: '12',
      particella: '35',
      comune: 'Verona',
      usiSuolo: ['Vite'],
      sauHa: 1,
    },
    {
      name: 'P3',
      foglio: '20',
      particella: '5',
      comune: 'Lazise',
      usiSuolo: ['Olivo'],
      sauHa: 3,
    },
  ];

  it('groups rows by (cropName, comune, foglio, usi) and aggregates allocations', () => {
    const normalizedFields = dedupExtractedFields(inputFields);
    const rawRows = [
      {
        cycle: {
          cropName: 'Vite',
          variety: 'Sangiovese',
          startDate: '2026-04-01',
          endDate: '2026-10-15',
        },
        cropType: 'Da vino',
        protocoll: 'Convenzionale',
        allocations: [
          { foglio: '12', particella: '34', areaHa: 2 },
          { foglio: '12', particella: '35', areaHa: 1 },
        ],
      },
      {
        cycle: {
          cropName: 'Olivo',
          variety: 'Frantoio',
          startDate: '2026-05-01',
          endDate: '2026-11-30',
        },
        cropType: 'Olio',
        protocoll: 'Biologico',
        allocations: [{ foglio: '20', particella: '5', areaHa: 3 }],
      },
    ];

    const actualA = groupRowsIntoProductionUnits(normalizedFields, rawRows);
    const actualB = groupRowsIntoProductionUnits(normalizedFields, rawRows);

    expect(actualA).toHaveLength(2);
    const vite = actualA.find((unit) => unit.groupingKey.cropName === 'vite');
    expect(vite?.areaHa).toBeCloseTo(3, 4);
    expect(vite?.allocations).toHaveLength(2);
    expect(vite?.name).toBe('Vite F12 Verona');
    expect(JSON.stringify(actualA)).toBe(JSON.stringify(actualB));
  });

  it('splits same crop on different fogli into separate UPs', () => {
    const inputFieldsTwoFogli: FieldExtracted[] = [
      { name: 'A', foglio: '12', particella: '1', comune: 'Verona', usiSuolo: ['Vite'] },
      { name: 'B', foglio: '13', particella: '1', comune: 'Verona', usiSuolo: ['Vite'] },
    ];
    const normalizedFields = dedupExtractedFields(inputFieldsTwoFogli);
    const rawRows = [
      {
        cycle: { cropName: 'Vite', startDate: '2026-04-01', endDate: '2026-10-15' },
        allocations: [
          { foglio: '12', particella: '1', areaHa: 1 },
          { foglio: '13', particella: '1', areaHa: 1 },
        ],
      },
    ];

    const actual = groupRowsIntoProductionUnits(normalizedFields, rawRows);

    expect(actual).toHaveLength(2);
    expect(actual.map((unit) => unit.groupingKey.foglio).sort()).toEqual(['12', '13']);
  });

  it('skips rows whose grouping key cannot be built', () => {
    const normalizedFields = dedupExtractedFields(inputFields);
    const rawRows = [
      {
        cycle: { cropName: '', startDate: '2026-04-01', endDate: '2026-10-15' },
        allocations: [{ foglio: '12', particella: '34', areaHa: 1 }],
      },
    ];

    const actual = groupRowsIntoProductionUnits(normalizedFields, rawRows);

    expect(actual).toHaveLength(0);
  });
});
