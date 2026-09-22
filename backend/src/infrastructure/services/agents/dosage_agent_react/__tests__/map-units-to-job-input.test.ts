import {
  mapUnitToJobInput,
  mergeJobUnitSources,
  resolveUnitDisciplinari,
  toWorkingMemoryUnit,
} from '../tools/map-units-to-job-input';

describe('mapUnitToJobInput', () => {
  it('copies field.region and city and defaults disciplinari to the region', () => {
    const mapped = mapUnitToJobInput({
      id: 'unit-1',
      cropName: 'Pero',
      variety: 'ABATE FETEL',
      areaHa: 1.2,
      field: { region: 'Emilia-Romagna', city: 'Riva del Po' },
    });

    expect(mapped.region).toBe('Emilia-Romagna');
    expect(mapped.city).toBe('Riva del Po');
    expect(mapped.disciplinari).toEqual(['Emilia-Romagna']);
    expect(mapped.cropVariety).toBe('ABATE FETEL');
  });

  it('keeps explicit disciplinari when already set', () => {
    expect(
      resolveUnitDisciplinari({
        region: 'Veneto',
        disciplinari: ['Veneto', 'Veneto'],
      }),
    ).toEqual(['Veneto']);
  });

  it('reads region from the unit when field is missing', () => {
    const mapped = mapUnitToJobInput({
      id: 'unit-2',
      cropName: 'Melo',
      region: 'Emilia-Romagna',
      city: 'Faenza',
    });
    expect(mapped.region).toBe('Emilia-Romagna');
    expect(mapped.disciplinari).toEqual(['Emilia-Romagna']);
  });
});

describe('toWorkingMemoryUnit', () => {
  it('persists region, city, and disciplinari from the field', () => {
    const memory = toWorkingMemoryUnit({
      id: 'unit-wm',
      name: 'Pero Abate',
      cropName: 'Pero',
      variety: 'ABATE FETEL',
      areaHa: 1,
      companyId: 'c1',
      companyName: 'Leonardi',
      field: { region: 'Emilia-Romagna', city: 'Riva del Po' },
    });
    expect(memory.region).toBe('Emilia-Romagna');
    expect(memory.city).toBe('Riva del Po');
    expect(memory.disciplinari).toEqual(['Emilia-Romagna']);
    expect(memory.field).toEqual({ region: 'Emilia-Romagna', city: 'Riva del Po' });
  });
});

describe('mergeJobUnitSources', () => {
  it('keeps region and disciplinari from working memory when the incoming unit omits them', () => {
    const merged = mergeJobUnitSources(
      [{ id: 'unit-1', cropName: 'Pero', variety: 'ABATE FETEL' }],
      [
        {
          id: 'unit-1',
          cropName: 'Pero',
          region: 'Emilia-Romagna',
          city: 'Riva del Po',
          disciplinari: ['Emilia-Romagna'],
        },
      ],
    );
    expect(merged[0]?.region).toBe('Emilia-Romagna');
    expect(merged[0]?.city).toBe('Riva del Po');
    expect(merged[0]?.disciplinari).toEqual(['Emilia-Romagna']);
  });
});
