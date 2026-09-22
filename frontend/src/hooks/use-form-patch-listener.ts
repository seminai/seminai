import { useEffect, useLayoutEffect, useRef } from 'react';
import { subscribeFormPatch } from '@/lib/chat-stream-store';
import type { FormPatchPayload } from '@/lib/agent-chat-events';
import {
  createEmptyDraft,
  type ProductionUnitDraft,
} from '@/components/organisms/manual-add/production-units-wizard-types';

const ALLOWED_DRAFT_KEYS = new Set<keyof ProductionUnitDraft>([
  'name',
  'cropCode',
  'cropName',
  'cropType',
  'variety',
  'protocoll',
  'protectionStructure',
  'startDate',
  'floweringDate',
  'harvestingDate',
  'endDate',
  'acquaTotalePeridoL',
  'occupazione',
  'destinazioneDiUso',
]);

/**
 * Subscribes to `form_patch` events for a thread and applies each patch to a
 * Production Units draft array. Reads the freshest `units` via a ref so
 * back-to-back patches are not lost to stale closures. The caller passes a
 * plain setter `setUnits(next)`; the hook computes the new array.
 */
export function useFormPatchListener(
  threadId: string,
  units: readonly ProductionUnitDraft[],
  setUnits: (next: ProductionUnitDraft[]) => void,
): void {
  const unitsRef = useRef<readonly ProductionUnitDraft[]>(units);
  const setUnitsRef = useRef<(next: ProductionUnitDraft[]) => void>(setUnits);
  useLayoutEffect(() => {
    unitsRef.current = units;
  }, [units]);
  useLayoutEffect(() => {
    setUnitsRef.current = setUnits;
  }, [setUnits]);

  useEffect(() => {
    if (!threadId) return undefined;
    return subscribeFormPatch(threadId, (_id, patch) => {
      setUnitsRef.current(applyFormPatch(unitsRef.current, patch));
    });
  }, [threadId]);
}

function applyFormPatch(
  units: readonly ProductionUnitDraft[],
  patch: FormPatchPayload,
): ProductionUnitDraft[] {
  switch (patch.action) {
    case 'set_unit_fields':
      return applySetUnitFields(units, patch.unitIndex, patch.fields);
    case 'add_unit':
      return [...units, mergeDraft(createEmptyDraft(), patch.unit)];
    case 'remove_unit':
      return applyRemoveUnit(units, patch.unitIndex);
    case 'move_allocation':
      return applyMoveAllocation(units, patch);
    default:
      return [...units];
  }
}

function applySetUnitFields(
  units: readonly ProductionUnitDraft[],
  unitIndex: number,
  fields: Record<string, unknown>,
): ProductionUnitDraft[] {
  if (unitIndex < 0 || unitIndex >= units.length) return [...units];
  return units.map((unit, index) => (index === unitIndex ? mergeDraft(unit, fields) : unit));
}

function applyRemoveUnit(
  units: readonly ProductionUnitDraft[],
  unitIndex: number,
): ProductionUnitDraft[] {
  if (unitIndex < 0 || unitIndex >= units.length) return [...units];
  return units.filter((_, index) => index !== unitIndex);
}

function applyMoveAllocation(
  units: readonly ProductionUnitDraft[],
  patch: Extract<FormPatchPayload, { action: 'move_allocation' }>,
): ProductionUnitDraft[] {
  const { fromUnitIndex, allocationIndex, toUnitIndex, toAllocationIndex } = patch;
  if (fromUnitIndex < 0 || fromUnitIndex >= units.length) return [...units];
  if (toUnitIndex < 0 || toUnitIndex >= units.length) return [...units];
  const from = units[fromUnitIndex];
  if (allocationIndex < 0 || allocationIndex >= from.allocations.length) return [...units];
  const moved = from.allocations[allocationIndex];

  const nextUnits = units.map((unit) => ({ ...unit, allocations: [...unit.allocations] }));
  nextUnits[fromUnitIndex].allocations.splice(allocationIndex, 1);
  if (fromUnitIndex === toUnitIndex) {
    const target = clampInsertIndex(toAllocationIndex, nextUnits[toUnitIndex].allocations.length);
    nextUnits[toUnitIndex].allocations.splice(target, 0, moved);
    return nextUnits;
  }
  const target = clampInsertIndex(toAllocationIndex, nextUnits[toUnitIndex].allocations.length);
  nextUnits[toUnitIndex].allocations.splice(target, 0, moved);
  return nextUnits;
}

function clampInsertIndex(index: number | undefined, max: number): number {
  if (index === undefined || index < 0) return max;
  return Math.min(index, max);
}

function mergeDraft(
  base: ProductionUnitDraft,
  patch: Record<string, unknown> | undefined,
): ProductionUnitDraft {
  if (!patch) return base;
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_DRAFT_KEYS.has(key as keyof ProductionUnitDraft)) continue;
    (next as Record<string, unknown>)[key] = coerceFieldValue(
      key as keyof ProductionUnitDraft,
      value,
      base[key as keyof ProductionUnitDraft],
    );
  }
  return next;
}

function coerceFieldValue(
  key: keyof ProductionUnitDraft,
  value: unknown,
  fallback: unknown,
): unknown {
  if (value === null || value === undefined) {
    return key === 'acquaTotalePeridoL' ? null : '';
  }
  if (key === 'acquaTotalePeridoL') {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : (fallback as number | null);
  }
  return typeof value === 'string' ? value : String(value);
}

