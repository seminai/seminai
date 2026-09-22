import type { ProductionUnitDetailInput, ProductionUnitDetailValues } from './production-units-wizard-schema';
import type { DateRange, FieldAllocation, ProductionUnitDraft } from './production-units-wizard-types';

export function buildProductionUnitDefaultValues(
  initialDraft: ProductionUnitDraft | null,
  dateRange: DateRange,
): ProductionUnitDetailInput {
  return {
    name: initialDraft?.name ?? '',
    cropCode: initialDraft?.cropCode ?? '',
    cropName: initialDraft?.cropName ?? '',
    cropType: initialDraft?.cropType ?? '',
    variety: initialDraft?.variety ?? '',
    protocoll: initialDraft?.protocoll ?? 'Convenzionale',
    protectionStructure: initialDraft?.protectionStructure ?? 'Nessuna',
    startDate: initialDraft?.startDate || dateRange.start,
    floweringDate: initialDraft?.floweringDate ?? '',
    harvestingDate: initialDraft?.harvestingDate ?? '',
    endDate: initialDraft?.endDate || dateRange.end,
    acquaTotalePeridoL: initialDraft?.acquaTotalePeridoL ?? null,
    occupazione: initialDraft?.occupazione ?? '',
    destinazioneDiUso: initialDraft?.destinazioneDiUso ?? '',
  };
}

export function buildProductionUnitDraft(input: {
  readonly values: ProductionUnitDetailValues;
  readonly initialDraft: ProductionUnitDraft | null;
  readonly generatedDraftId: string;
  readonly allocations: readonly FieldAllocation[];
}): ProductionUnitDraft {
  const { values, initialDraft, generatedDraftId, allocations } = input;
  return {
    id: initialDraft?.id ?? generatedDraftId,
    name: values.name.trim(),
    cropCode: values.cropCode,
    cropName: values.cropName,
    cropType: values.cropType,
    variety: values.variety.trim(),
    protocoll: values.protocoll.trim(),
    protectionStructure: values.protectionStructure.trim(),
    startDate: values.startDate,
    floweringDate: values.floweringDate,
    harvestingDate: values.harvestingDate,
    endDate: values.endDate,
    acquaTotalePeridoL: values.acquaTotalePeridoL ?? null,
    occupazione: values.occupazione?.trim() ?? '',
    destinazioneDiUso: values.destinazioneDiUso?.trim() ?? '',
    allocations,
  };
}
