import type { ProductionUnitPreview } from '../../../../domain/dtos/file-extraction.dto';
import type { ShapefileExtractedField } from '../../shapefile-parser';

interface CropCandidate {
  readonly uso: string;
  readonly startDate: string | null;
}

export function enrichVenetoPcgFieldsWithCrop(
  fields: readonly ShapefileExtractedField[],
  productionUnits: readonly ProductionUnitPreview[],
): readonly ShapefileExtractedField[] {
  const candidatesByField = buildCropCandidatesByField(productionUnits);
  return fields.map((field) => enrichField(field, candidatesByField));
}

function buildCropCandidatesByField(
  productionUnits: readonly ProductionUnitPreview[],
): ReadonlyMap<string, readonly CropCandidate[]> {
  const candidates = new Map<string, CropCandidate[]>();
  for (const unit of productionUnits) {
    const cycle = unit.cycles?.[0];
    const uso = cycle?.occupazione?.trim() || unit.cropName?.trim();
    if (!uso) continue;
    const startDate = unit.startDate ?? cycle?.startDate ?? null;
    const allocations = unit.fieldAllocations ?? [];
    for (const allocation of allocations) {
      if (!allocation.foglio || !allocation.particella) continue;
      const key = buildFieldKey(allocation.comune, allocation.foglio, allocation.particella);
      const existing = candidates.get(key) ?? [];
      candidates.set(key, [...existing, { uso, startDate }]);
    }
  }
  return candidates;
}

function enrichField(
  field: ShapefileExtractedField,
  candidatesByField: ReadonlyMap<string, readonly CropCandidate[]>,
): ShapefileExtractedField {
  if (field.uso?.trim()) return field;
  if (!field.foglio || !field.particella) return field;
  const key = buildFieldKey(field.city, field.foglio, field.particella);
  const candidates = candidatesByField.get(key);
  if (!candidates || candidates.length === 0) return field;
  return { ...field, uso: selectBestCropLabel(candidates) };
}

function selectBestCropLabel(candidates: readonly CropCandidate[]): string {
  const sorted = [...candidates].sort((left, right) =>
    compareStartDates(right.startDate, left.startDate),
  );
  const uniqueLabels = [...new Set(sorted.map((candidate) => candidate.uso))];
  return uniqueLabels.join(' | ');
}

function compareStartDates(left: string | null, right: string | null): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left.localeCompare(right);
}

function buildFieldKey(
  comune: string | null | undefined,
  foglio: string | null | undefined,
  particella: string | null | undefined,
): string {
  return [
    normalizeKeyPart(comune),
    normalizeCadastralPart(foglio),
    normalizeCadastralPart(particella),
  ].join('|');
}

function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeCadastralPart(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  const withoutLeadingZeroes = trimmed.replace(/^0+/, '');
  return withoutLeadingZeroes.length > 0 ? withoutLeadingZeroes : trimmed;
}
