import { describe, expect, it } from 'vitest';
import {
  buildFieldReferenceId,
  draftsToPreviews,
  findFieldIndexForAllocation,
  normalizeAgriculturalFields,
  previewsToDrafts,
} from '@/lib/agricultural-extraction-mappers';
import {
  validateAgriculturalExtraction,
  validateAgriculturalFieldsStep,
  validateAgriculturalProductionUnitsStep,
} from '@/lib/agricultural-extraction-validation';
import { getCurrentYearRange } from '@/components/organisms/manual-add/production-units-wizard-types';
import type { AgriculturalExtractionData, FieldBulkPreview, ProductionUnitPreview } from '@/types/extraction';

const baseField = (overrides: Partial<FieldBulkPreview> = {}): FieldBulkPreview => ({
  companyId: 'company-1',
  name: 'Campo A',
  coordinates: [],
  coordinatesGaussBoaga: [],
  latitude: null,
  longitude: null,
  polygon: null,
  polygonGaussBoaga: null,
  gisHa: null,
  sauHa: 1.2,
  ph: null,
  nitrogen: null,
  phosphorus: null,
  potassium: null,
  calcium: null,
  magnesium: null,
  soilType: null,
  uso: null,
  qualita: null,
  superficieCatastaleMq: null,
  sezione: '1',
  foglio: '70',
  particella: '24',
  subalterno: null,
  nation: null,
  region: null,
  city: 'Verona',
  address: null,
  cap: null,
  variazioneMq: null,
  inizioConduzione: null,
  fineConduzione: null,
  ...overrides,
});

const baseUnit = (overrides: Partial<ProductionUnitPreview> = {}): ProductionUnitPreview => ({
  name: 'UP Vite',
  cropName: 'Vite',
  cropType: 'Permanente',
  variety: 'Glera',
  protocoll: 'Convenzionale',
  protectionStructure: 'Nessuna',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  areaHa: 1.2,
  allocations: [
    {
      foglio: '70',
      particella: '24',
      sezione: '1',
      areaHa: 1.2,
      fieldName: 'Campo A',
    },
  ],
  ...overrides,
});

const sampleData = (): AgriculturalExtractionData => ({
  fields: [baseField()],
  productionUnits: [baseUnit()],
  extractedCount: 2,
});

describe('agricultural-extraction-mappers', () => {
  it('normalizes missing coordinates to empty arrays', () => {
    const field = baseField({ coordinates: undefined as unknown as number[] });
    const [normalized] = normalizeAgriculturalFields([field]);
    expect(normalized.coordinates).toEqual([]);
  });

  it('defaults missing conduction dates to the current year range', () => {
    const field = baseField({ inizioConduzione: null, fineConduzione: null });
    const [normalized] = normalizeAgriculturalFields([field]);
    const defaultRange = getCurrentYearRange();
    expect(normalized.inizioConduzione).toBe(defaultRange.start);
    expect(normalized.fineConduzione).toBe(defaultRange.end);
  });

  it('preserves conduction dates already present on the extracted field', () => {
    const field = baseField({ inizioConduzione: '2025-03-01', fineConduzione: '2025-09-30' });
    const [normalized] = normalizeAgriculturalFields([field]);
    expect(normalized.inizioConduzione).toBe('2025-03-01');
    expect(normalized.fineConduzione).toBe('2025-09-30');
  });

  it('maps previews to drafts and back preserving cadastral allocations', () => {
    const data = sampleData();
    const drafts = previewsToDrafts(data.productionUnits, data.fields);
    expect(drafts[0].allocations[0].fieldId).toBe(buildFieldReferenceId(0));
    const restored = draftsToPreviews(drafts, data.fields);
    expect(restored[0].allocations?.[0].foglio).toBe('70');
    expect(restored[0].allocations?.[0].particella).toBe('24');
    expect(restored[0].cropName).toBe('Vite');
  });

  it('resolves field index by foglio and particella', () => {
    const fields = [baseField()];
    const index = findFieldIndexForAllocation(
      { foglio: '70', particella: '24', sezione: '1', areaHa: 1 },
      fields,
    );
    expect(index).toBe(0);
  });
});

describe('agricultural-extraction-validation', () => {
  it('accepts valid agricultural extraction data', () => {
    const result = validateAgriculturalExtraction(sampleData());
    expect(result.valid).toBe(true);
  });

  it('flags missing field names on fields step', () => {
    const data = sampleData();
    const invalidData: AgriculturalExtractionData = {
      ...data,
      fields: [baseField({ name: '   ' })],
    };
    const result = validateAgriculturalFieldsStep(invalidData);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.step).toBe('fields');
  });

  it('flags unresolved allocations on production units step', () => {
    const data = sampleData();
    const invalidData: AgriculturalExtractionData = {
      ...data,
      productionUnits: [
        baseUnit({
          allocations: [{ foglio: '99', particella: '99', areaHa: 1, fieldName: 'Missing' }],
        }),
      ],
    };
    const result = validateAgriculturalProductionUnitsStep(invalidData);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.step === 'production_units')).toBe(true);
  });
});
