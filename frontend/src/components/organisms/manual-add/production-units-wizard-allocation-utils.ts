import {
  buildAllocationMap,
  getRemainingCapacity,
  mapAvailableFields,
  roundArea,
  type AvailableField,
} from '@/components/organisms/production-unit-field-allocations-utils';
import type { FieldAllocation, ProductionUnitDraft } from '@/components/organisms/manual-add/production-units-wizard-types';

export function buildSessionUsedByFieldId(
  units: readonly ProductionUnitDraft[],
  excludeUnitId?: string,
): Map<string, number> {
  const entries = units
    .filter((unit) => unit.id !== excludeUnitId)
    .flatMap((unit) => unit.allocations);
  return buildAllocationMap(entries);
}

export function getWizardRemainingCapacity(
  fieldId: string,
  availableByFieldId: ReadonlyMap<string, AvailableField>,
  workingMap: ReadonlyMap<string, number>,
  sessionUsedMap: ReadonlyMap<string, number>,
): number {
  const emptyCurrent = new Map<string, number>();
  const emptyDraft = new Map<string, number>();
  const base = getRemainingCapacity(fieldId, availableByFieldId, emptyCurrent, emptyDraft);
  const sessionUsed = sessionUsedMap.get(fieldId) ?? 0;
  const working = workingMap.get(fieldId) ?? 0;
  return roundArea(Math.max(base - sessionUsed - working, 0));
}

export function getWizardRowMaxCapacity(
  fieldId: string,
  availableByFieldId: ReadonlyMap<string, AvailableField>,
  workingMap: ReadonlyMap<string, number>,
  sessionUsedMap: ReadonlyMap<string, number>,
  currentArea: number,
): number {
  const remaining = getWizardRemainingCapacity(
    fieldId,
    availableByFieldId,
    workingMap,
    sessionUsedMap,
  );
  return roundArea(currentArea + remaining);
}

export function clampAreaToCapacity(areaHa: number, maxCapacity: number): number {
  if (!Number.isFinite(areaHa) || areaHa < 0) return 0;
  return roundArea(Math.min(areaHa, maxCapacity));
}

export function sumWorkingAllocations(map: ReadonlyMap<string, number>): number {
  return roundArea([...map.values()].reduce((sum, value) => sum + value, 0));
}

export function getWizardFieldMaxForUnit(
  fieldId: string,
  availableByFieldId: ReadonlyMap<string, AvailableField>,
  sessionUsedMap: ReadonlyMap<string, number>,
): number {
  const field = availableByFieldId.get(fieldId);
  const base = field?.areaAvailable ?? 0;
  const sessionUsed = sessionUsedMap.get(fieldId) ?? 0;
  return roundArea(Math.max(base - sessionUsed, 0));
}

export function validateSameCompanyFields(
  fieldIds: readonly string[],
  availableFields: readonly AvailableField[],
  companyId: string,
): boolean {
  if (fieldIds.length === 0) return false;
  const fieldCompany = new Map(availableFields.map((f) => [f.fieldId, f.companyId]));
  return fieldIds.every((id) => fieldCompany.get(id) === companyId);
}

export { mapAvailableFields, roundArea, type AvailableField };

export function validateDraftAllocationsAgainstSession(
  draft: ProductionUnitDraft,
  allUnits: readonly ProductionUnitDraft[],
  availableByFieldId: ReadonlyMap<string, AvailableField>,
  excludeUnitId?: string,
): boolean {
  const sessionUsed = buildSessionUsedByFieldId(allUnits, excludeUnitId ?? draft.id);
  return draft.allocations.every((allocation) => {
    const max = getWizardRowMaxCapacity(
      allocation.fieldId,
      availableByFieldId,
      new Map(),
      sessionUsed,
      allocation.areaHa,
    );
    return allocation.areaHa > 0 && allocation.areaHa <= max;
  });
}

export function mergeFieldNames(
  allocations: readonly FieldAllocation[],
  availableByFieldId: ReadonlyMap<string, AvailableField>,
): FieldAllocation[] {
  return allocations.map((allocation) => ({
    ...allocation,
    fieldName:
      allocation.fieldName ??
      availableByFieldId.get(allocation.fieldId)?.fieldName ??
      'Campo',
  }));
}

export function hasUnresolvedFieldIds(allocations: readonly FieldAllocation[]): boolean {
  return allocations.some((allocation) => !allocation.fieldId.trim());
}

export function hasDuplicateFieldIds(allocations: readonly FieldAllocation[]): boolean {
  const seen = new Set<string>();
  for (const allocation of allocations) {
    const fieldId = allocation.fieldId.trim();
    if (!fieldId) continue;
    if (seen.has(fieldId)) return true;
    seen.add(fieldId);
  }
  return false;
}

export function isUnitAllocationInvalid(unit: ProductionUnitDraft): boolean {
  if (unit.allocations.length === 0) return true;
  return hasUnresolvedFieldIds(unit.allocations) || hasDuplicateFieldIds(unit.allocations);
}

export function countUnitsWithInvalidAllocations(units: readonly ProductionUnitDraft[]): number {
  return units.filter(isUnitAllocationInvalid).length;
}
