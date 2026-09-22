import {
  ExtractFromFileUseCase,
  type ProgressCallback,
} from '../application/use-cases/onboarding/ExtractFromFileUseCase';

jest.mock('../infrastructure/services/agents/file_agent/field_csv_agent', () => ({
  FieldCsvAgent: jest.fn().mockImplementation(() => ({
    extractFieldsFromCsv: jest.fn().mockResolvedValue({
      fields: [
        {
          name: 'Campo 1',
          foglio: '1',
          particella: '10',
          nation: null,
          region: null,
          city: null,
          address: null,
          cap: null,
          subalterno: null,
          sezione: null,
          superficieCatastaleMq: 1000,
          gisHa: null,
          sauHa: null,
          variazioneMq: null,
          uso: null,
          qualita: null,
          soilType: null,
          ph: null,
          nitrogen: null,
          phosphorus: null,
          potassium: null,
          calcium: null,
          magnesium: null,
          latitude: null,
          longitude: null,
          inizioConduzione: null,
          fineConduzione: null,
        },
      ],
      diagnostics: {},
    }),
  })),
}));

jest.mock('../infrastructure/services/agents/production_unit/production_unit_csv_agent', () => ({
  ProductionUnitCsvAgent: jest.fn().mockImplementation(() => ({
    extractProductionUnitsFromCsv: jest.fn().mockResolvedValue({
      units: [
        {
          name: 'PU 1',
          protocoll: 'bio',
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          areaHa: 1.5,
          cycles: [
            {
              cycleIndex: 0,
              cropName: 'Grano',
              cropType: 'Cereali',
              variety: null,
              occupazione: null,
              destinazione: null,
              protectionStructure: null,
              startDate: null,
              endDate: null,
              floweringDate: null,
              harvestingDate: null,
            },
          ],
          allocations: [],
        },
      ],
    }),
  })),
}));

jest.mock('../infrastructure/services/agents/file_agent/piano_colturale_pdf_agent');
jest.mock('../infrastructure/services/shapefile-parser');
jest.mock('../infrastructure/services/pcg-geojson-parser', () => ({
  parsePcgGeojson: jest.fn().mockResolvedValue({
    fields: [
      {
        name: 'ARCOLE - F9 P404',
        nation: 'IT',
        region: 'VENETO',
        city: 'ARCOLE',
        address: null,
        cap: null,
        foglio: '9',
        particella: '404',
        subalterno: null,
        sezione: null,
        superficieCatastaleMq: 7341,
        gisHa: 0.7341,
        sauHa: 0.7341,
        variazioneMq: null,
        uso: 'PIANTE OLEIFERE-COLZA-COLZA',
        qualita: null,
        soilType: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        latitude: 45.2,
        longitude: 11.1,
        coordinates: [11.1, 45.2],
        coordinatesGaussBoaga: [700000, 5000000],
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [11.1, 45.2],
              [11.2, 45.2],
              [11.2, 45.3],
              [11.1, 45.2],
            ],
          ],
        },
        polygonGaussBoaga: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
        inizioConduzione: '2025-11-01',
        fineConduzione: '2026-06-30',
      },
    ],
    productionUnits: [
      {
        name: 'COLZA',
        cropName: 'COLZA',
        cropType: '003',
        variety: '',
        protocoll: '',
        protectionStructure: '',
        startDate: '2025-11-01',
        endDate: '2026-06-30',
        destinazioneDiUso: null,
        areaHa: 0.7341,
        fieldIndex: 0,
      },
    ],
    diagnostics: {
      totalRecords: 1,
      shapeType: 'Polygon',
      sourceCrs: 'EPSG:32632',
    },
  }),
}));

describe('ExtractFromFileUseCase', () => {
  it('extracts fields and production units from CSV', async () => {
    const useCase = new ExtractFromFileUseCase();
    const progressEvents: Array<{ phase: string; progress: number }> = [];
    const onProgress: ProgressCallback = (phase, progress) => {
      progressEvents.push({ phase, progress });
    };

    const result = await useCase.execute({
      fileBuffer: Buffer.from('test csv data'),
      originalName: 'test.csv',
      mimeType: 'text/csv',
      onProgress,
    });

    expect(result.fieldCount).toBe(1);
    expect(result.fields[0].name).toBe('Campo 1');
    expect(result.productionUnitCount).toBe(1);
    expect(result.productionUnits[0].name).toBe('PU 1');
    expect(result.productionUnits[0].cropName).toBe('Grano');

    expect(progressEvents.length).toBeGreaterThanOrEqual(3);
    expect(progressEvents[0].phase).toBe('validating');
    expect(progressEvents[progressEvents.length - 1].phase).toBe('completed');
    expect(progressEvents[progressEvents.length - 1].progress).toBe(100);
  });

  it('works without progress callback', async () => {
    const useCase = new ExtractFromFileUseCase();
    const result = await useCase.execute({
      fileBuffer: Buffer.from('test'),
      originalName: 'data.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(result.fieldCount).toBe(1);
  });

  it('extracts fields and production units from PCG GeoJSON', async () => {
    const useCase = new ExtractFromFileUseCase();
    const progressEvents: Array<{ phase: string; progress: number }> = [];
    const result = await useCase.execute({
      fileBuffer: Buffer.from('{"type":"FeatureCollection","features":[]}'),
      originalName: 'PCG_test.geojson',
      mimeType: 'application/geo+json',
      onProgress: (phase, progress) => {
        progressEvents.push({ phase, progress });
      },
    });

    expect(result.fieldCount).toBe(1);
    expect(result.fields[0].foglio).toBe('9');
    expect(result.fields[0].polygon).toBeTruthy();
    expect(result.productionUnitCount).toBe(1);
    expect(result.productionUnits[0].cropName).toBe('COLZA');
    expect(progressEvents.some((event) => event.phase === 'parsing_geojson')).toBe(true);
  });
});
