import path from 'node:path';
import fs from 'node:fs';
import { type Field } from '../../../domain/entities/Field';
import {
  type ProductionUnitRaw,
  type ProductionCycleRaw,
} from '../agents/production_unit/production_unit_csv_agent';
import { normalizeNullableString } from './field-normalizer';
import { normalizeAreaHa } from '../../utils/area-normalization';

export type { ProductionUnitRaw, ProductionCycleRaw };

export type CropCatalogEntry = {
  code: string;
  species: string;
  cropType: string;
  sowingPeriod?: { minDate: string; maxDate: string };
  floweringPeriod?: { minDate: string; maxDate: string };
  harvestPeriod?: { minDate: string; maxDate: string };
};

export function getCropCatalog(): CropCatalogEntry[] {
  const catalogPath = path.resolve(process.cwd(), 'dataset/crop_family/crop.json');
  const content = fs.readFileSync(catalogPath, 'utf-8');
  return JSON.parse(content) as CropCatalogEntry[];
}

export function normalizePuName(value: string | null | undefined): string {
  if (typeof value !== 'string') return 'Unnamed production unit';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Unnamed production unit';
}

export function normalizeCadastralId(value: string): string {
  const stripped = value.trim().toUpperCase().replace(/^0+/, '');
  return stripped.length > 0 ? stripped : '0';
}

export function buildFieldKey(foglio: string, particella: string, sezione?: string | null): string {
  const normalizedSezione = sezione ? sezione.trim().toUpperCase() : 'UNSPECIFIED';
  return `${normalizeCadastralId(foglio)}_${normalizeCadastralId(particella)}_${normalizedSezione}`;
}

export function buildFieldIndex(fields: Field[]): Map<string, Field[]> {
  const index = new Map<string, Field[]>();
  for (const field of fields) {
    if (!field.foglio || !field.particella) continue;
    const keyFull = buildFieldKey(field.foglio, field.particella, field.sezione);
    addToIndex(index, keyFull, field);
    const keyAny = buildFieldKey(field.foglio, field.particella, 'ANY');
    addToIndex(index, keyAny, field);
  }
  return index;
}

function addToIndex(index: Map<string, Field[]>, key: string, field: Field): void {
  const list = index.get(key);
  if (list) {
    list.push(field);
  } else {
    index.set(key, [field]);
  }
}

export function getFieldFromIndex(
  foglio: string | null,
  particella: string | null,
  sezione: string | null | undefined,
  fieldIndex: Map<string, Field[]>,
): Field | null {
  if (!foglio || !particella) return null;
  const normalizedSezione = sezione ?? 'UNSPECIFIED';
  const fullKey = buildFieldKey(foglio, particella, normalizedSezione);
  const anyKey = buildFieldKey(foglio, particella, 'ANY');
  return pickFirst(fieldIndex, fullKey) ?? pickFirst(fieldIndex, anyKey);
}

function pickFirst(index: Map<string, Field[]>, key: string): Field | null {
  const list = index.get(key);
  return list && list.length > 0 ? list[0] : null;
}

export function sanitizeCadastralValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function ensureIso(value: string | null): string | null {
  if (!value) return null;
  return value.length === 10 ? value : null;
}

function findBestCropFromCycle(
  cycle: ProductionCycleRaw | undefined,
  catalog: CropCatalogEntry[],
): CropCatalogEntry | null {
  if (!cycle) return null;
  const target = normalizeNullableString(cycle.cropName) ?? normalizeNullableString(cycle.cropType);
  if (!target) return null;
  const targetLower = target.toLowerCase();
  let best: CropCatalogEntry | null = null;
  let bestScore = 0;
  for (const entry of catalog) {
    const entryTokens = `${entry.species} ${entry.cropType}`.toLowerCase();
    let score = 0;
    for (const token of targetLower.split(/\s+/).filter(Boolean)) {
      if (entryTokens.includes(token)) score += 1;
    }
    if (entry.code.toLowerCase().includes(targetLower)) score += 2;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

function buildDateFromPeriod(value?: string): string | null {
  if (!value) return null;
  const [day, month] = value.split('-').map((v) => parseInt(v, 10));
  if (Number.isNaN(day) || Number.isNaN(month)) return null;
  const year = new Date().getFullYear();
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().split('T')[0];
}

function resolveDatesFromCycle(
  cycle: ProductionCycleRaw | undefined,
  crop: CropCatalogEntry | null,
): {
  startDate: string | null;
  floweringDate: string | null;
  harvestingDate: string | null;
  endDate: string | null;
} {
  if (!cycle) return { startDate: null, floweringDate: null, harvestingDate: null, endDate: null };
  const startDate = normalizeNullableString(cycle.startDate);
  const floweringDate = normalizeNullableString(cycle.floweringDate);
  const harvestingDate = normalizeNullableString(cycle.harvestingDate);
  const endDate = normalizeNullableString(cycle.endDate);
  if (!crop) {
    return {
      startDate: ensureIso(startDate),
      floweringDate: ensureIso(floweringDate),
      harvestingDate: ensureIso(harvestingDate),
      endDate: ensureIso(endDate),
    };
  }
  return {
    startDate: ensureIso(startDate) ?? buildDateFromPeriod(crop.sowingPeriod?.minDate),
    floweringDate: ensureIso(floweringDate) ?? buildDateFromPeriod(crop.floweringPeriod?.minDate),
    harvestingDate: ensureIso(harvestingDate) ?? buildDateFromPeriod(crop.harvestPeriod?.minDate),
    endDate: ensureIso(endDate) ?? buildDateFromPeriod(crop.harvestPeriod?.maxDate),
  };
}

/** Build a preview for a single production unit, matching fields by cadastral refs. */
export function buildProductionUnitPreview(
  unit: ProductionUnitRaw,
  companyId: string,
  fieldIndex: Map<string, Field[]>,
  cropCatalog: CropCatalogEntry[],
): Record<string, unknown> {
  const primaryCycle = unit.cycles[0];
  const areaHa = normalizeAreaHa(unit.areaHa);
  const allocations = buildAllocations(unit, fieldIndex, areaHa);
  const primaryFieldId = allocations.find((a) => a.fieldId)?.fieldId ?? null;
  const primaryFieldName = allocations.find((a) => a.fieldId)?.fieldName ?? null;
  const cycles = unit.cycles.map((cycle) => {
    const catalogCrop = findBestCropFromCycle(cycle, cropCatalog);
    const dates = resolveDatesFromCycle(cycle, catalogCrop);
    return {
      cycleIndex: cycle.cycleIndex,
      cropName: normalizeNullableString(cycle.cropName),
      cropType: normalizeNullableString(cycle.cropType),
      cropCode: normalizeNullableString(cycle.cropCode),
      variety: normalizeNullableString(cycle.variety),
      occupazione: normalizeNullableString(cycle.occupazione),
      destinazione: normalizeNullableString(cycle.destinazione),
      protectionStructure: normalizeNullableString(cycle.protectionStructure),
      ...dates,
    };
  });
  return {
    companyId,
    name: normalizePuName(unit.name),
    protocoll: normalizeNullableString(unit.protocoll),
    allocations,
    areaHa,
    fieldId: primaryFieldId,
    matchedFieldName: primaryFieldName,
    cropName: normalizeNullableString(primaryCycle?.cropName),
    cropType: normalizeNullableString(primaryCycle?.cropType),
    cropCode: normalizeNullableString(primaryCycle?.cropCode),
    variety: normalizeNullableString(primaryCycle?.variety),
    protectionStructure: normalizeNullableString(primaryCycle?.protectionStructure),
    occupazione: normalizeNullableString(primaryCycle?.occupazione),
    destinazione: normalizeNullableString(primaryCycle?.destinazione),
    startDate: ensureIso(unit.startDate),
    endDate: ensureIso(unit.endDate),
    cycles,
  };
}

function buildAllocations(
  unit: ProductionUnitRaw,
  fieldIndex: Map<string, Field[]>,
  areaHa: number | null,
): Array<Record<string, unknown>> {
  const allocations: Array<Record<string, unknown>> = [];
  if (unit.allocations && unit.allocations.length > 0) {
    for (const alloc of unit.allocations) {
      const foglio = sanitizeCadastralValue(alloc.foglio);
      const particella = sanitizeCadastralValue(alloc.particella);
      const sezione = sanitizeCadastralValue(alloc.sezione);
      const matchedField = getFieldFromIndex(foglio, particella, sezione, fieldIndex);
      const allocationAreaHa = normalizeAreaHa(alloc.areaHa, {
        referenceAreaSqm: matchedField?.superficieCatastaleMq,
      });
      allocations.push({
        fieldId: matchedField?.id ?? null,
        fieldName: matchedField?.name ?? alloc.fieldName ?? null,
        areaHa: allocationAreaHa,
        sezione: alloc.sezione ?? null,
        foglio: alloc.foglio ?? null,
        particella: alloc.particella ?? null,
        subalterno: alloc.subalterno ?? null,
      });
    }
  } else {
    const foglio = sanitizeCadastralValue(unit.foglio);
    const particella = sanitizeCadastralValue(unit.particella);
    if (foglio && particella) {
      const sezione = sanitizeCadastralValue(unit.sezione);
      const matchedField = getFieldFromIndex(foglio, particella, sezione, fieldIndex);
      if (matchedField) {
        const fieldAreaHa =
          normalizeAreaHa(matchedField.sauHa) ??
          normalizeAreaHa(matchedField.gisHa) ??
          normalizeAreaHa(matchedField.superficieCatastaleMq, {
            referenceAreaSqm: matchedField.superficieCatastaleMq,
          });
        allocations.push({
          fieldId: matchedField.id,
          fieldName: matchedField.name,
          areaHa: areaHa ?? fieldAreaHa ?? null,
          sezione: unit.sezione ?? null,
          foglio: unit.foglio ?? null,
          particella: unit.particella ?? null,
          subalterno: unit.subalterno ?? null,
        });
      }
    }
  }
  return allocations;
}
