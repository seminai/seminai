import type { PutProductionUnitsIdBody } from '@/generated/schemas';
import { toNullableInput, toOptionalInput, toOptionalInputNumber } from './master-detail-utils';

function toNullableDateInput(value: string | undefined): string | null | undefined {
  const trimmed = value?.trim() ?? '';
  if (typeof value === 'undefined') return undefined;
  return trimmed.length > 0 ? trimmed : null;
}

export function buildProductionUnitDetailUpdatePayload(
  data: Record<string, string>,
): PutProductionUnitsIdBody {
  return {
    name: data.name ?? '',
    cropName: data.cropName ?? '',
    cropType: data.cropType ?? '',
    variety: data.variety ?? '',
    protocoll: data.protocoll ?? '',
    protectionStructure: data.protectionStructure ?? '',
    areaHa: toOptionalInputNumber(data.areaHa),
    startDate: toOptionalInput(data.startDate),
    floweringDate: toNullableDateInput(data.floweringDate),
    harvestingDate: toNullableDateInput(data.harvestingDate),
    endDate: toOptionalInput(data.endDate),
    occupazione: toNullableInput(data.occupazione),
    destinazioneDiUso: toNullableInput(data.destinazioneDiUso),
    acquaTotalePeridoL: toOptionalInputNumber(data.acquaTotalePeridoL),
    seasonYear: toOptionalInputNumber(data.seasonYear),
    cycleIndex: toOptionalInputNumber(data.cycleIndex),
  };
}
