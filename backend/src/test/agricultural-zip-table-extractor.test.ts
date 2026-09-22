import AdmZip from 'adm-zip';

const mockExtractFieldsFromCsv = jest.fn();
const mockExtractProductionUnitsFromCsv = jest.fn();

jest.mock('../infrastructure/services/agents/file_agent/field_csv_agent', () => ({
  FieldCsvAgent: jest.fn().mockImplementation(() => ({
    extractFieldsFromCsv: mockExtractFieldsFromCsv,
  })),
}));

jest.mock('../infrastructure/services/agents/production_unit/production_unit_csv_agent', () => ({
  ProductionUnitCsvAgent: jest.fn().mockImplementation(() => ({
    extractProductionUnitsFromCsv: mockExtractProductionUnitsFromCsv,
  })),
}));

jest.mock('../infrastructure/services/agents/file_agent/piano_colturale_pdf_agent', () => ({
  PianoColturalePdfAgent: jest.fn().mockImplementation(() => ({
    extractFromPdf: jest.fn(),
  })),
}));

import { extractAgriculturalZipTables } from '../infrastructure/services/extraction/agricultural-zip-table-extractor';

describe('extractAgriculturalZipTables', () => {
  beforeEach(() => {
    mockExtractFieldsFromCsv.mockReset();
    mockExtractProductionUnitsFromCsv.mockReset();
  });

  it('inspects an unknown ZIP and combines dynamic field and production-unit tables', async () => {
    mockExtractFieldsFromCsv.mockImplementation(async (buffer: Buffer) => {
      const text = buffer.toString('utf8');
      return {
        fields: text.includes('field-table')
          ? [
              {
                name: 'Field 1',
                coordinates: [],
                foglio: '1',
                particella: '10',
              },
            ]
          : [],
        diagnostics: makeDiagnostics('fields'),
      };
    });
    mockExtractProductionUnitsFromCsv.mockImplementation(async (buffer: Buffer) => {
      const text = buffer.toString('utf8');
      return {
        units: text.includes('pu-table')
          ? [
              {
                name: 'PU 1',
                sezione: null,
                foglio: '1',
                particella: '10',
                subalterno: null,
                areaHa: 1,
                protocoll: null,
                startDate: '2026-01-01',
                endDate: '2026-12-31',
                cycles: [
                  {
                    cycleIndex: 1,
                    cropName: 'Mais',
                    cropType: 'Cereali',
                    cropCode: null,
                    variety: null,
                    occupazione: null,
                    destinazione: null,
                    protectionStructure: null,
                    startDate: '2026-01-01',
                    endDate: '2026-12-31',
                    floweringDate: null,
                    harvestingDate: null,
                  },
                ],
                allocations: [
                  {
                    fieldName: 'Field 1',
                    sezione: null,
                    foglio: '1',
                    particella: '10',
                    subalterno: null,
                    areaHa: 1,
                  },
                ],
              },
            ]
          : [],
        diagnostics: makeDiagnostics('production_units'),
      };
    });

    const zip = new AdmZip();
    zip.addFile('unknown/fields.csv', Buffer.from('field-table'));
    zip.addFile('unknown/production-units.csv', Buffer.from('pu-table'));

    const actual = await extractAgriculturalZipTables(zip.toBuffer());

    expect(actual.fieldsResult.fields).toHaveLength(1);
    expect(actual.productionUnitResult.units).toHaveLength(1);
    expect(actual.diagnostics.selectedFieldEntry).toBe('unknown/fields.csv');
    expect(actual.diagnostics.selectedProductionUnitEntry).toBe('unknown/production-units.csv');
  });
});

function makeDiagnostics(detectedFormat: string) {
  return {
    totalRows: 1,
    extractedRows: 1,
    detectedFormat,
    skippedRows: [],
    warnings: [],
  };
}
