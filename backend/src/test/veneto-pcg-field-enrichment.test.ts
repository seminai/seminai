import { describe, expect, it } from '@jest/globals';
import { enrichVenetoPcgFieldsWithCrop } from '../infrastructure/services/extraction/veneto-pcg/veneto-pcg-field-enrichment';
import type { ProductionUnitPreview } from '../domain/dtos/file-extraction.dto';
import type { ShapefileExtractedField } from '../infrastructure/services/shapefile-parser';

const baseField = (overrides: Partial<ShapefileExtractedField> = {}): ShapefileExtractedField => ({
  name: 'VILLAFRANCA DI VERONA - F70 P24',
  coordinates: [10.8, 45.3],
  coordinatesGaussBoaga: [],
  latitude: 45.3,
  longitude: 10.8,
  polygon: null,
  polygonGaussBoaga: null,
  gisHa: 4.5,
  sauHa: 4.5,
  soilType: null,
  uso: null,
  qualita: null,
  inizioConduzione: null,
  fineConduzione: null,
  nation: 'IT',
  region: 'VENETO',
  city: 'VILLAFRANCA DI VERONA',
  address: null,
  sezione: null,
  foglio: '70',
  particella: '24',
  subalterno: null,
  superficieCatastaleMq: 45040,
  cap: null,
  variazioneMq: null,
  ph: null,
  nitrogen: null,
  phosphorus: null,
  potassium: null,
  calcium: null,
  magnesium: null,
  ...overrides,
});

const baseUnit = (overrides: Partial<ProductionUnitPreview> = {}): ProductionUnitPreview => ({
  name: 'foraggio prato polifita - row 1',
  cropName: 'foraggio prato polifita non avvicendato per 5 anni',
  cropType: 'FG',
  variety: null,
  protocoll: 'FG-32',
  protectionStructure: null,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  areaHa: 4.5,
  fieldAllocations: [
    {
      fieldName: 'VILLAFRANCA DI VERONA - F70 P24',
      foglio: '70',
      particella: '24',
      sezione: null,
      subalterno: null,
      comune: 'VILLAFRANCA DI VERONA',
      codiceNazionale: null,
      areaHa: 4.5,
    },
  ],
  cycles: [
    {
      cycleIndex: 1,
      cropName: 'foraggio prato polifita non avvicendato per 5 anni',
      cropType: 'FG',
      variety: null,
      protocoll: 'FG-32',
      protectionStructure: null,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      occupazione: 'foraggio prato polifita non avvicendato per 5 anni - permanente',
      destinazione: null,
    },
  ],
  ...overrides,
});

describe('enrichVenetoPcgFieldsWithCrop', () => {
  it('populates field uso from linked production unit occupazione', () => {
    const fields = [baseField()];
    const productionUnits = [baseUnit()];
    const actual = enrichVenetoPcgFieldsWithCrop(fields, productionUnits);
    expect(actual[0].uso).toBe('foraggio prato polifita non avvicendato per 5 anni - permanente');
  });

  it('does not overwrite an existing field uso', () => {
    const fields = [baseField({ uso: 'Existing uso' })];
    const productionUnits = [baseUnit()];
    const actual = enrichVenetoPcgFieldsWithCrop(fields, productionUnits);
    expect(actual[0].uso).toBe('Existing uso');
  });
});
