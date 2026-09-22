import { findFieldIndexForAllocation } from '@/lib/agricultural-extraction-mappers';
import type { AgriculturalExtractionData, ProductionUnitPreview } from '@/types/extraction';

export type AgriculturalValidationStep = 'fields' | 'production_units';

export interface AgriculturalValidationError {
  readonly step: AgriculturalValidationStep;
  readonly message: string;
}

export interface AgriculturalValidationResult {
  readonly valid: boolean;
  readonly errors: readonly AgriculturalValidationError[];
}

export function validateAgriculturalFieldsStep(
  data: AgriculturalExtractionData,
): AgriculturalValidationResult {
  const errors: AgriculturalValidationError[] = [];
  data.fields.forEach((field, index) => {
    if (!field.name?.trim()) {
      errors.push({
        step: 'fields',
        message: `Campo ${index + 1}: il nome è obbligatorio.`,
      });
    }
    if (!Array.isArray(field.coordinates)) {
      errors.push({
        step: 'fields',
        message: `Campo ${index + 1}: coordinate mancanti.`,
      });
    }
  });
  return { valid: errors.length === 0, errors };
}

export function validateAgriculturalProductionUnitsStep(
  data: AgriculturalExtractionData,
): AgriculturalValidationResult {
  const errors: AgriculturalValidationError[] = [];
  if (data.productionUnits.length === 0) {
    errors.push({
      step: 'production_units',
      message: 'Aggiungi almeno un\'unità produttiva prima di confermare.',
    });
    return { valid: false, errors };
  }
  data.productionUnits.forEach((unit, index) => {
    errors.push(...validateProductionUnit(unit, index, data));
  });
  return { valid: errors.length === 0, errors };
}

export function validateAgriculturalExtraction(
  data: AgriculturalExtractionData,
): AgriculturalValidationResult {
  const fieldsResult = validateAgriculturalFieldsStep(data);
  const unitsResult = validateAgriculturalProductionUnitsStep(data);
  const errors = [...fieldsResult.errors, ...unitsResult.errors];
  return { valid: errors.length === 0, errors };
}

function validateProductionUnit(
  unit: ProductionUnitPreview,
  index: number,
  data: AgriculturalExtractionData,
): AgriculturalValidationError[] {
  const label = unit.name?.trim() || `Unità ${index + 1}`;
  const errors: AgriculturalValidationError[] = [];
  const requiredFields: Array<[string, string | null | undefined]> = [
    ['nome', unit.name],
    ['coltura', unit.cropName],
    ['tipo coltura', unit.cropType],
    ['varietà', unit.variety],
    ['protocollo', unit.protocoll],
    ['struttura protetta', unit.protectionStructure],
    ['data inizio', unit.startDate],
    ['data fine', unit.endDate],
  ];
  requiredFields.forEach(([fieldLabel, value]) => {
    if (!value?.trim()) {
      errors.push({
        step: 'production_units',
        message: `${label}: ${fieldLabel} obbligatorio.`,
      });
    }
  });
  const allocations = unit.allocations ?? unit.fieldAllocations ?? [];
  if (allocations.length === 0) {
    errors.push({
      step: 'production_units',
      message: `${label}: serve almeno un'allocazione su un campo.`,
    });
    return errors;
  }
  allocations.forEach((alloc, allocIndex) => {
    const fieldIndex = findFieldIndexForAllocation(alloc, data.fields);
    if (fieldIndex == null) {
      const ref =
        alloc.foglio && alloc.particella
          ? ` (${alloc.foglio}-${alloc.particella})`
          : alloc.fieldName
            ? ` "${alloc.fieldName}"`
            : '';
      errors.push({
        step: 'production_units',
        message: `${label}: allocazione ${allocIndex + 1}${ref} non collegata a nessun campo.`,
      });
      return;
    }
    const duplicateMatches = data.fields.filter(
      (field) =>
        alloc.foglio &&
        alloc.particella &&
        normalizeCadastral(field.foglio) === normalizeCadastral(alloc.foglio) &&
        normalizeCadastral(field.particella) === normalizeCadastral(alloc.particella),
    );
    if (duplicateMatches.length > 1) {
      errors.push({
        step: 'production_units',
        message: `${label}: allocazione ${alloc.foglio}-${alloc.particella} ambigua (più campi corrispondenti).`,
      });
    }
  });
  return errors;
}

function normalizeCadastral(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  const withoutLeadingZeroes = trimmed.replace(/^0+/, '');
  return withoutLeadingZeroes.length > 0 ? withoutLeadingZeroes : trimmed;
}
