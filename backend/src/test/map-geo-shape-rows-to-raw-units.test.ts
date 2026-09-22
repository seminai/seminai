import { mapGeoShapeRowsToRawUnits } from '../infrastructure/services/extraction/map-geo-shape-rows-to-raw-units';

describe('mapGeoShapeRowsToRawUnits', () => {
  it('maps fieldIndex to allocation fieldName', () => {
    const fields = [
      { name: 'Appezzamento 1 - Frumento', sezione: null, foglio: null, particella: null },
      { name: 'Appezzamento 2 - Mais', sezione: null, foglio: null, particella: null },
    ];
    const rawUnits = mapGeoShapeRowsToRawUnits(fields, [
      {
        name: 'Frumento tenero',
        cropName: 'Frumento tenero',
        cropType: '001',
        variety: 'Bolero',
        protocoll: 'Bio',
        protectionStructure: 'N',
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        areaHa: 3.5,
        fieldIndex: 0,
        destinazioneDiUso: null,
      },
    ]);

    expect(rawUnits).toHaveLength(1);
    expect(rawUnits[0].allocations).toHaveLength(1);
    expect(rawUnits[0].allocations[0].fieldName).toBe('Appezzamento 1 - Frumento');
    expect(rawUnits[0].allocations[0].areaHa).toBe(3.5);
  });
});
