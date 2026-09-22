import type { ColumnDef } from '@tanstack/react-table';
import type { FileExtractionResponse } from '@/types/extraction';
import { extractArray } from '@/lib/api-response';
import { toDateInputValue, toNullableNumber, toNullableString } from './master-detail-utils';

export interface ProductionUnitFieldAllocation {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly sauHa: number | null;
  readonly gisHa: number | null;
  readonly areaHaOnField: number;
  readonly companyId: string;
  readonly companyName: string | null;
}

export interface PuRow {
  readonly id: string;
  readonly name: string;
  readonly cropName: string | null;
  readonly cropType: string | null;
  readonly variety: string | null;
  readonly protocoll: string | null;
  readonly protectionStructure: string | null;
  readonly areaHa: number | null;
  readonly startDate: string | null;
  readonly floweringDate: string | null;
  readonly harvestingDate: string | null;
  readonly endDate: string | null;
  readonly occupazione: string | null;
  readonly destinazioneDiUso: string | null;
  readonly acquaTotalePeridoL: number | null;
  readonly seasonYear: number | null;
  readonly cycleIndex: number | null;
  readonly companyName: string | null;
  readonly fields: readonly ProductionUnitFieldAllocation[];
}

export const PRODUCTION_UNIT_COLUMN_LABELS: Record<string, string> = {
  name: 'Nome',
  cropName: 'Coltura',
  variety: 'Varietà',
  areaHa: 'Area (ha)',
  startDate: 'Inizio',
  endDate: 'Fine',
  companyName: 'Azienda',
};

export const productionUnitColumns: ColumnDef<PuRow, unknown>[] = [
  { accessorKey: 'name', header: 'Nome', filterFn: 'multiValue' as never },
  { accessorKey: 'cropName', header: 'Coltura', filterFn: 'multiValue' as never },
  { accessorKey: 'variety', header: 'Varietà', filterFn: 'multiValue' as never },
  { accessorKey: 'areaHa', header: 'Area (ha)', filterFn: 'multiValue' as never },
  { accessorKey: 'startDate', header: 'Inizio', filterFn: 'multiValue' as never },
  { accessorKey: 'companyName', header: 'Azienda', filterFn: 'multiValue' as never },
];

export function mapProductionUnitRows(
  responseData: unknown,
  companyId: string,
  extractions: readonly FileExtractionResponse[] | undefined,
): PuRow[] {
  const list = responseData ? extractArray(responseData, 'productionUnits') : [];
  const apiUnits = list.filter((item) => getItemCompanyId(item) === companyId).map(mapApiUnit);
  if (apiUnits.length > 0) return apiUnits;
  return mapFallbackUnits(extractions);
}

function getItemCompanyId(item: Record<string, unknown>): string {
  const pu = item.productionUnit as Record<string, unknown> | undefined;
  return String(item.companyId ?? pu?.companyId ?? '');
}

function mapApiUnit(item: Record<string, unknown>): PuRow {
  const pu = (item.productionUnit ?? item) as Record<string, unknown>;
  const crop = item.crop as Record<string, unknown> | undefined;
  const companyName = toNullableString(item.companyName);
  return {
    ...mapBaseUnit(pu, crop),
    companyName,
    fields: mapAllocatedFields(item.fields, getItemCompanyId(item), companyName),
  };
}

function mapBaseUnit(pu: Record<string, unknown>, crop?: Record<string, unknown>): Omit<PuRow, 'fields'> {
  return {
    id: String(pu.id ?? ''),
    name: String(pu.name ?? '-'),
    cropName: toNullableString(crop?.name ?? pu.cropName),
    cropType: toNullableString(pu.cropType),
    variety: toNullableString(crop?.variety ?? pu.variety),
    protocoll: toNullableString(pu.protocoll),
    protectionStructure: toNullableString(pu.protectionStructure),
    areaHa: toNullableNumber(pu.areaHa),
    startDate: toDateInputValue(pu.startDate),
    floweringDate: toDateInputValue(pu.floweringDate),
    harvestingDate: toDateInputValue(pu.harvestingDate),
    endDate: toDateInputValue(pu.endDate),
    occupazione: toNullableString(pu.occupazione),
    destinazioneDiUso: toNullableString(pu.destinazioneDiUso),
    acquaTotalePeridoL: toNullableNumber(pu.acquaTotalePeridoL),
    seasonYear: toNullableNumber(pu.seasonYear),
    cycleIndex: toNullableNumber(pu.cycleIndex),
    companyName: null,
  };
}

function mapAllocatedFields(
  value: unknown,
  companyId: string,
  companyName: string | null,
): ProductionUnitFieldAllocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rawField) => {
    const field = rawField as Record<string, unknown>;
    const fieldId = toNullableString(field.id);
    if (!fieldId) return [];
    return [{
      fieldId,
      fieldName: String(field.name ?? 'Campo senza nome'),
      sauHa: toNullableNumber(field.sauHa),
      gisHa: toNullableNumber(field.gisHa),
      areaHaOnField: toNullableNumber(field.areaHaOnField) ?? 0,
      companyId,
      companyName,
    }];
  });
}

function mapFallbackUnits(extractions: readonly FileExtractionResponse[] | undefined): PuRow[] {
  return (extractions ?? []).flatMap((extraction) => {
    if (extraction.category !== 'production_units' && extraction.category !== 'agricultural') return [];
    const extractedData = extraction.extractedData as Record<string, unknown> | null;
    if (!extractedData || !Array.isArray(extractedData.productionUnits)) return [];
    return extractedData.productionUnits.map((rawUnit, index) => {
      const unit = rawUnit as Record<string, unknown>;
      return {
        ...mapBaseUnit({ ...unit, id: unit.id ?? `${extraction.id}-${index}` }),
        fields: [],
      };
    });
  });
}
