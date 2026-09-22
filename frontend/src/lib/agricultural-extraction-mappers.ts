import {
  createEmptyDraft,
  getCurrentYearRange,
  type FieldAllocation,
  type ProductionUnitDraft,
} from '@/components/organisms/manual-add/production-units-wizard-types';
import type {
  AgriculturalExtractionData,
  FieldBulkPreview,
  ProductionUnitAllocationPreview,
  ProductionUnitPreview,
} from '@/types/extraction';

export function buildFieldReferenceId(index: number): string {
  return `extract-field-${index}`;
}

export function normalizeAgriculturalFields(
  fields: readonly FieldBulkPreview[],
): readonly FieldBulkPreview[] {
  const defaultRange = getCurrentYearRange();
  return fields.map((field) => ({
    ...field,
    coordinates: Array.isArray(field.coordinates) ? field.coordinates : [],
    coordinatesGaussBoaga: Array.isArray(field.coordinatesGaussBoaga)
      ? field.coordinatesGaussBoaga
      : [],
    inizioConduzione: field.inizioConduzione ?? defaultRange.start,
    fineConduzione: field.fineConduzione ?? defaultRange.end,
  }));
}

export function normalizeAgriculturalData(data: AgriculturalExtractionData): AgriculturalExtractionData {
  return {
    ...data,
    fields: normalizeAgriculturalFields(data.fields),
  };
}

export function previewsToDrafts(
  productionUnits: readonly ProductionUnitPreview[],
  fieldPreviews: readonly FieldBulkPreview[],
): ProductionUnitDraft[] {
  return productionUnits.map((preview, index) => previewToDraft(preview, fieldPreviews, index));
}

export function draftsToPreviews(
  drafts: readonly ProductionUnitDraft[],
  fieldPreviews: readonly FieldBulkPreview[],
): readonly ProductionUnitPreview[] {
  return drafts.map((draft) => draftToPreview(draft, fieldPreviews));
}

export function mergeDraftsIntoAgriculturalData(
  data: AgriculturalExtractionData,
  drafts: readonly ProductionUnitDraft[],
): AgriculturalExtractionData {
  return normalizeAgriculturalData({
    ...data,
    productionUnits: draftsToPreviews(drafts, data.fields),
  });
}

function previewToDraft(
  preview: ProductionUnitPreview,
  fieldPreviews: readonly FieldBulkPreview[],
  index: number,
): ProductionUnitDraft {
  const base = createEmptyDraft(`pu-extract-${index}-${Date.now()}`);
  const source = preview.allocations ?? preview.fieldAllocations ?? [];
  const cycle = preview.cycles?.[0];
  const allocations: FieldAllocation[] = source.map((alloc) => {
    const fieldIndex = findFieldIndexForAllocation(alloc, fieldPreviews);
    const fieldPreview = fieldIndex != null ? fieldPreviews[fieldIndex] : undefined;
    return {
      fieldId: fieldIndex != null ? buildFieldReferenceId(fieldIndex) : '',
      areaHa:
        typeof alloc.areaHa === 'number' && Number.isFinite(alloc.areaHa)
          ? alloc.areaHa
          : fieldPreview?.sauHa ?? preview.areaHa ?? 0,
      fieldName: alloc.fieldName ?? fieldPreview?.name ?? undefined,
    };
  });
  return {
    ...base,
    name: preview.name ?? '',
    cropName: preview.cropName ?? cycle?.cropName ?? '',
    cropType: preview.cropType ?? cycle?.cropType ?? '',
    variety: preview.variety ?? cycle?.variety ?? '',
    protocoll: preview.protocoll ?? cycle?.protocoll ?? base.protocoll,
    protectionStructure:
      preview.protectionStructure ?? cycle?.protectionStructure ?? base.protectionStructure,
    startDate: preview.startDate ?? cycle?.startDate ?? '',
    floweringDate: cycle?.floweringDate ?? '',
    harvestingDate: cycle?.harvestingDate ?? '',
    endDate: preview.endDate ?? cycle?.endDate ?? '',
    occupazione: cycle?.occupazione ?? '',
    destinazioneDiUso: cycle?.destinazione ?? '',
    allocations,
  };
}

function draftToPreview(
  draft: ProductionUnitDraft,
  fieldPreviews: readonly FieldBulkPreview[],
): ProductionUnitPreview {
  const allocations = draft.allocations.map((alloc) => {
    const fieldPreview = resolveFieldPreview(alloc.fieldId, fieldPreviews);
    return {
      fieldName: alloc.fieldName ?? fieldPreview?.name ?? null,
      foglio: fieldPreview?.foglio ?? null,
      particella: fieldPreview?.particella ?? null,
      sezione: fieldPreview?.sezione ?? null,
      subalterno: fieldPreview?.subalterno ?? null,
      comune: fieldPreview?.city ?? null,
      areaHa: alloc.areaHa,
    } satisfies ProductionUnitAllocationPreview;
  });
  return {
    name: draft.name,
    cropName: draft.cropName || null,
    cropType: draft.cropType || null,
    variety: draft.variety || null,
    protocoll: draft.protocoll || null,
    protectionStructure: draft.protectionStructure || null,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
    areaHa: draft.allocations.reduce((sum, alloc) => sum + alloc.areaHa, 0) || null,
    allocations,
    fieldAllocations: allocations,
    cycles:
      draft.cropName || draft.startDate
        ? [
            {
              cycleIndex: 1,
              cropName: draft.cropName || null,
              cropType: draft.cropType || null,
              variety: draft.variety || null,
              protocoll: draft.protocoll || null,
              protectionStructure: draft.protectionStructure || null,
              startDate: draft.startDate || null,
              floweringDate: draft.floweringDate || null,
              harvestingDate: draft.harvestingDate || null,
              endDate: draft.endDate || null,
              occupazione: draft.occupazione || null,
              destinazione: draft.destinazioneDiUso || null,
            },
          ]
        : undefined,
  };
}

function resolveFieldPreview(
  fieldId: string,
  fieldPreviews: readonly FieldBulkPreview[],
): FieldBulkPreview | undefined {
  const match = /^extract-field-(\d+)$/.exec(fieldId);
  if (!match) return undefined;
  const index = Number(match[1]);
  return fieldPreviews[index];
}

export function findFieldIndexForAllocation(
  alloc: ProductionUnitAllocationPreview,
  fields: readonly FieldBulkPreview[],
): number | undefined {
  if (alloc.foglio && alloc.particella) {
    const allocKey = buildCadastralKey(alloc.sezione, alloc.foglio, alloc.particella, alloc.subalterno);
    const matches = fields
      .map((field, index) => ({ index, key: buildCadastralKey(field.sezione, field.foglio, field.particella, field.subalterno) }))
      .filter(({ key }) => key === allocKey);
    if (matches.length === 1) return matches[0].index;
    if (matches.length > 1) return undefined;
  }
  if (alloc.fieldName) {
    const normalized = alloc.fieldName.trim().toLowerCase();
    const matches = fields
      .map((field, index) => ({ index, name: field.name.trim().toLowerCase() }))
      .filter(({ name }) => name === normalized);
    if (matches.length === 1) return matches[0].index;
  }
  return undefined;
}

function buildCadastralKey(
  sezione: string | null | undefined,
  foglio: string | null | undefined,
  particella: string | null | undefined,
  subalterno: string | null | undefined,
): string | null {
  if (!foglio || !particella) return null;
  return [
    normalizeKeyPart(sezione),
    normalizeCadastralPart(foglio),
    normalizeCadastralPart(particella),
    normalizeKeyPart(subalterno),
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
