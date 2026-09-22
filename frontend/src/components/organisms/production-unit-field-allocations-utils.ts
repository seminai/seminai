import { extractArray } from '@/lib/api-response';
import { toNullableNumber, toNullableString } from './master-detail-utils';
import type { ProductionUnitFieldAllocation } from './production-units-master-detail-model';

export interface AllocationDraft {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly areaHa: number;
}

export interface AvailableField {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly sauHa: number | null;
  readonly areaOccupied: number;
  readonly areaAvailable: number;
}

export function createAllocationDrafts(
  allocations: readonly ProductionUnitFieldAllocation[],
): AllocationDraft[] {
  return allocations.map((allocation) => ({
    fieldId: allocation.fieldId,
    fieldName: allocation.fieldName,
    areaHa: allocation.areaHaOnField,
  }));
}

export function areAllocationDraftsDirty(
  drafts: readonly AllocationDraft[],
  allocations: readonly ProductionUnitFieldAllocation[],
): boolean {
  if (drafts.length !== allocations.length) return true;
  const allocationMap = buildAllocationMap(
    allocations.map((allocation) => ({
      fieldId: allocation.fieldId,
      areaHa: allocation.areaHaOnField,
    })),
  );
  return drafts.some((draft) => allocationMap.get(draft.fieldId) !== draft.areaHa);
}

export function mapAvailableFields(responseData: unknown, companyId: string): AvailableField[] {
  return extractArray(responseData, 'companies').flatMap((company) => {
    const currentCompanyId = toNullableString(company.companyId);
    if (currentCompanyId !== companyId || !Array.isArray(company.fields)) return [];
    const companyName = toNullableString(company.companyName) ?? 'Azienda';
    return company.fields.flatMap((rawField) => mapAvailableField(rawField, currentCompanyId, companyName));
  });
}

export function buildAllocationMap(
  allocations: readonly { readonly fieldId: string; readonly areaHa: number }[],
): Map<string, number> {
  return allocations.reduce((acc, allocation) => {
    acc.set(allocation.fieldId, (acc.get(allocation.fieldId) ?? 0) + allocation.areaHa);
    return acc;
  }, new Map<string, number>());
}

export function roundArea(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function filterAvailableFields(
  fields: readonly AvailableField[],
  drafts: readonly AllocationDraft[],
  searchValue: string,
  getCapacity: (fieldId: string) => number,
): AvailableField[] {
  const draftIds = new Set(drafts.map((draft) => draft.fieldId));
  const search = searchValue.trim().toLowerCase();
  return fields.filter((field) => {
    if (draftIds.has(field.fieldId) || getCapacity(field.fieldId) <= 0) return false;
    if (!search) return true;
    return field.fieldName.toLowerCase().includes(search) || field.companyName.toLowerCase().includes(search);
  });
}

export function getRemainingCapacity(
  fieldId: string,
  availableByFieldId: ReadonlyMap<string, AvailableField>,
  currentAllocationMap: ReadonlyMap<string, number>,
  draftAllocationMap: ReadonlyMap<string, number>,
): number {
  const field = availableByFieldId.get(fieldId);
  const currentArea = currentAllocationMap.get(fieldId) ?? 0;
  const draftArea = draftAllocationMap.get(fieldId) ?? 0;
  return roundArea(Math.max((field?.areaAvailable ?? 0) + currentArea - draftArea, 0));
}

export function getRowCapacity(
  draft: AllocationDraft,
  availableByFieldId: ReadonlyMap<string, AvailableField>,
  currentAllocationMap: ReadonlyMap<string, number>,
  draftAllocationMap: ReadonlyMap<string, number>,
): number {
  return roundArea(
    draft.areaHa + getRemainingCapacity(draft.fieldId, availableByFieldId, currentAllocationMap, draftAllocationMap),
  );
}

export function areDraftsValid(
  drafts: readonly AllocationDraft[],
  availableByFieldId: ReadonlyMap<string, AvailableField>,
  currentAllocationMap: ReadonlyMap<string, number>,
  draftAllocationMap: ReadonlyMap<string, number>,
): boolean {
  return drafts.every((draft) => {
    const rowCapacity = getRowCapacity(draft, availableByFieldId, currentAllocationMap, draftAllocationMap);
    return Number.isFinite(draft.areaHa) && draft.areaHa >= 0 && draft.areaHa <= rowCapacity;
  });
}

function mapAvailableField(
  rawField: unknown,
  companyId: string,
  companyName: string,
): AvailableField[] {
  const field = rawField as Record<string, unknown>;
  const fieldId = toNullableString(field.id);
  if (!fieldId) return [];
  return [{
    fieldId,
    fieldName: toNullableString(field.name) ?? 'Campo senza nome',
    companyId,
    companyName,
    sauHa: toNullableNumber(field.sauHa),
    areaOccupied: toNullableNumber(field.areaOccupied) ?? 0,
    areaAvailable: toNullableNumber(field.areaAvailable) ?? 0,
  }];
}
