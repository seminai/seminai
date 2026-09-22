export type WizardStep = 'context' | 'allocations' | 'detail' | 'review';

export interface DateRange {
  readonly start: string;
  readonly end: string;
}

export interface FieldAllocation {
  readonly fieldId: string;
  readonly areaHa: number;
  readonly fieldName?: string;
}

export interface ProductionUnitDraft {
  readonly id: string;
  readonly name: string;
  readonly cropCode: string;
  readonly cropName: string;
  readonly cropType: string;
  readonly variety: string;
  readonly protocoll: string;
  readonly protectionStructure: string;
  readonly startDate: string;
  readonly floweringDate: string;
  readonly harvestingDate: string;
  readonly endDate: string;
  readonly acquaTotalePeridoL: number | null;
  readonly occupazione: string;
  readonly destinazioneDiUso: string;
  readonly allocations: readonly FieldAllocation[];
}

export interface WorkingAllocationRow {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly areaHa: number;
}

export const WIZARD_STEPS: readonly { id: WizardStep; label: string }[] = [
  { id: 'context', label: 'Azienda e periodo' },
  { id: 'allocations', label: 'Allocazione campi' },
  { id: 'detail', label: 'Dettaglio UP' },
  { id: 'review', label: 'Riepilogo' },
] as const;

export function getCurrentYearRange(): DateRange {
  const year = new Date().getFullYear();
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function createEmptyDraft(id?: string): ProductionUnitDraft {
  const draftId = id ?? `pu-${Date.now()}`;
  return {
    id: draftId,
    name: '',
    cropCode: '',
    cropName: '',
    cropType: '',
    variety: '',
    protocoll: 'Convenzionale',
    protectionStructure: 'Nessuna',
    startDate: '',
    floweringDate: '',
    harvestingDate: '',
    endDate: '',
    acquaTotalePeridoL: null,
    occupazione: '',
    destinazioneDiUso: '',
    allocations: [],
  };
}

export function allocationsMapToRows(
  map: ReadonlyMap<string, number>,
  fieldNameById: ReadonlyMap<string, string>,
): WorkingAllocationRow[] {
  return [...map.entries()]
    .filter(([, areaHa]) => areaHa > 0)
    .map(([fieldId, areaHa]) => ({
      fieldId,
      fieldName: fieldNameById.get(fieldId) ?? 'Campo',
      areaHa,
    }));
}

export function rowsToAllocations(rows: readonly WorkingAllocationRow[]): FieldAllocation[] {
  return rows.map((row) => ({
    fieldId: row.fieldId,
    areaHa: row.areaHa,
    fieldName: row.fieldName,
  }));
}

export function draftAllocationsToMap(
  allocations: readonly FieldAllocation[],
): Map<string, number> {
  return allocations.reduce((acc, item) => {
    acc.set(item.fieldId, (acc.get(item.fieldId) ?? 0) + item.areaHa);
    return acc;
  }, new Map<string, number>());
}

export function totalAllocatedHa(allocations: readonly { areaHa: number }[]): number {
  return Math.round(allocations.reduce((sum, a) => sum + a.areaHa, 0) * 10000) / 10000;
}
