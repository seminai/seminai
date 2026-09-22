import type {
  FieldExtracted,
  ProductionUnitCycleExtracted,
  ProductionUnitExtracted,
} from '../../../infrastructure/services/agents/dosage_agent_react/tools/file-extraction-types';
import type {
  GroupingKey,
  NormalizedAllocation,
  NormalizedField,
  NormalizedProductionUnit,
} from './normalized-extraction.types';

type ProductionUnitInputRow = Pick<
  ProductionUnitExtracted,
  'cropType' | 'protocoll' | 'name' | 'destinazioneDiUso' | 'protectionStructure'
> & {
  readonly cycle: ProductionUnitCycleExtracted;
  readonly allocations: ReadonlyArray<{
    readonly foglio: string;
    readonly particella: string;
    readonly areaHa: number;
  }>;
};

const FIELD_TEMP_PREFIX = 'ext-fld-';
const PU_TEMP_PREFIX = 'ext-up-';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function capitalize(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function padIndex(index: number): string {
  return String(index + 1).padStart(3, '0');
}

function buildFieldDedupKey(field: FieldExtracted): string {
  const cadastral = [field.sezione, field.foglio, field.particella]
    .map((part) => normalizeText(part ?? null))
    .join('|');
  const subalterno = normalizeText((field as { subalterno?: string | null }).subalterno ?? null);
  if (field.foglio && field.particella) {
    return `cad:${cadastral}|${subalterno}`;
  }
  const fallbackName = normalizeText(field.name ?? field.nome ?? null);
  return `name:${normalizeText(field.comune ?? null)}|${fallbackName}`;
}

function mergeUsiSuolo(
  current: ReadonlyArray<string> | undefined,
  incoming: ReadonlyArray<string> | undefined,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of [current ?? [], incoming ?? []]) {
    for (const item of list) {
      const key = normalizeText(item);
      if (key.length === 0 || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(item.trim());
    }
  }
  return result;
}

function mergeField(target: FieldExtracted, source: FieldExtracted): FieldExtracted {
  const usiSuolo = mergeUsiSuolo(target.usiSuolo, source.usiSuolo);
  const sauHa = Math.max(target.sauHa ?? 0, source.sauHa ?? 0) || (target.sauHa ?? source.sauHa);
  const polygon = target.polygon ?? source.polygon ?? null;
  const polygonGaussBoaga = target.polygonGaussBoaga ?? source.polygonGaussBoaga ?? null;
  return {
    ...target,
    ...source,
    name: target.name ?? source.name,
    nome: target.nome ?? source.nome,
    usiSuolo,
    sauHa,
    polygon,
    polygonGaussBoaga,
  };
}

export function dedupExtractedFields(rawFields: ReadonlyArray<FieldExtracted>): NormalizedField[] {
  const merged = new Map<string, FieldExtracted>();
  for (const field of rawFields) {
    const key = buildFieldDedupKey(field);
    const existing = merged.get(key);
    merged.set(key, existing ? mergeField(existing, field) : { ...field });
  }
  const orderedKeys = Array.from(merged.keys()).sort();
  return orderedKeys.map((key, index) => {
    const field = merged.get(key) as FieldExtracted;
    return {
      ...field,
      tempId: `${FIELD_TEMP_PREFIX}${padIndex(index)}`,
      status: 'new' as const,
    };
  });
}

export function buildGroupingKey(input: {
  readonly cropName?: string | null;
  readonly comune?: string | null;
  readonly foglio?: string | null;
  readonly usiSuolo?: ReadonlyArray<string>;
}): GroupingKey | null {
  const cropName = normalizeText(input.cropName);
  const comune = normalizeText(input.comune);
  const foglio = normalizeText(input.foglio);
  if (cropName.length === 0 || comune.length === 0 || foglio.length === 0) {
    return null;
  }
  const usi = input.usiSuolo ?? [];
  const usoSuoloPrimario = usi.length > 0 ? normalizeText(usi[0]) : null;
  const usoSuoloSecondario = usi.length > 1 ? normalizeText(usi[1]) : null;
  return {
    cropName,
    comune,
    foglio,
    usoSuoloPrimario,
    usoSuoloSecondario,
  };
}

function serializeGroupingKey(key: GroupingKey): string {
  return [
    key.cropName,
    key.comune,
    key.foglio,
    key.usoSuoloPrimario ?? '',
    key.usoSuoloSecondario ?? '',
  ].join('||');
}

function buildAllocationFieldLookup(fields: ReadonlyArray<NormalizedField>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const field of fields) {
    if (field.foglio && field.particella) {
      lookup.set(`${normalizeText(field.foglio)}|${normalizeText(field.particella)}`, field.tempId);
    }
  }
  return lookup;
}

function minDateIso(values: ReadonlyArray<string | null | undefined>): string | null {
  const valid = values
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => Number.isFinite(value));
  if (valid.length === 0) {
    return null;
  }
  return new Date(Math.min(...valid)).toISOString();
}

function maxDateIso(values: ReadonlyArray<string | null | undefined>): string | null {
  const valid = values
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => Number.isFinite(value));
  if (valid.length === 0) {
    return null;
  }
  return new Date(Math.max(...valid)).toISOString();
}

function buildUnitName(cropName: string, foglio: string, comune: string): string {
  return `${capitalize(cropName)} F${foglio.toUpperCase()} ${capitalize(comune)}`;
}

export function groupRowsIntoProductionUnits(
  normalizedFields: ReadonlyArray<NormalizedField>,
  rawRows: ReadonlyArray<ProductionUnitInputRow>,
): NormalizedProductionUnit[] {
  const fieldLookup = buildAllocationFieldLookup(normalizedFields);
  const fieldByTempId = new Map(normalizedFields.map((field) => [field.tempId, field]));
  const groups = new Map<
    string,
    {
      readonly groupingKey: GroupingKey;
      readonly rows: ProductionUnitInputRow[];
    }
  >();
  for (const row of rawRows) {
    const bucketsForRow = new Set<string>();
    for (const allocation of row.allocations) {
      const fieldTempId = fieldLookup.get(
        `${normalizeText(allocation.foglio)}|${normalizeText(allocation.particella)}`,
      );
      const field = fieldTempId ? fieldByTempId.get(fieldTempId) : undefined;
      const groupingKey = buildGroupingKey({
        cropName: row.cycle.cropName ?? null,
        comune: field?.comune ?? null,
        foglio: allocation.foglio,
        usiSuolo: field?.usiSuolo,
      });
      if (!groupingKey) {
        continue;
      }
      const serialized = serializeGroupingKey(groupingKey);
      if (bucketsForRow.has(serialized)) {
        continue;
      }
      bucketsForRow.add(serialized);
      const bucket = groups.get(serialized);
      if (bucket) {
        bucket.rows.push(row);
      } else {
        groups.set(serialized, { groupingKey, rows: [row] });
      }
    }
  }
  const orderedKeys = Array.from(groups.keys()).sort();
  return orderedKeys.map((serialized, index) => {
    const group = groups.get(serialized) as {
      groupingKey: GroupingKey;
      rows: ProductionUnitInputRow[];
    };
    const allocations = buildGroupAllocations(group.rows, group.groupingKey, fieldLookup);
    const areaHa = allocations.reduce((sum, alloc) => sum + alloc.areaHa, 0);
    const cycles = group.rows.map((row) => row.cycle);
    const startDate = minDateIso(cycles.map((cycle) => cycle.startDate ?? null));
    const endDate = maxDateIso(cycles.map((cycle) => cycle.endDate ?? null));
    const firstRow = group.rows[0];
    return {
      tempId: `${PU_TEMP_PREFIX}${padIndex(index)}`,
      name: buildUnitName(
        group.groupingKey.cropName,
        group.groupingKey.foglio,
        group.groupingKey.comune,
      ),
      groupingKey: group.groupingKey,
      cropName: group.groupingKey.cropName,
      cropType: firstRow.cropType ?? null,
      variety: firstRow.cycle.variety ?? null,
      protocoll: firstRow.protocoll ?? null,
      startDate: startDate ?? new Date().toISOString(),
      endDate: endDate ?? new Date().toISOString(),
      areaHa: Number(areaHa.toFixed(4)),
      allocations,
      cycles,
    };
  });
}

function buildGroupAllocations(
  rows: ReadonlyArray<ProductionUnitInputRow>,
  groupingKey: GroupingKey,
  fieldLookup: Map<string, string>,
): NormalizedAllocation[] {
  const merged = new Map<string, NormalizedAllocation>();
  for (const row of rows) {
    for (const allocation of row.allocations) {
      if (normalizeText(allocation.foglio) !== groupingKey.foglio) {
        continue;
      }
      const fieldTempId = fieldLookup.get(
        `${normalizeText(allocation.foglio)}|${normalizeText(allocation.particella)}`,
      );
      if (!fieldTempId) {
        continue;
      }
      const key = `${fieldTempId}|${normalizeText(allocation.foglio)}|${normalizeText(allocation.particella)}`;
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          areaHa: Number((existing.areaHa + allocation.areaHa).toFixed(4)),
        });
      } else {
        merged.set(key, {
          fieldTempId,
          foglio: allocation.foglio,
          particella: allocation.particella,
          areaHa: Number(allocation.areaHa.toFixed(4)),
        });
      }
    }
  }
  return Array.from(merged.values()).sort((left, right) =>
    left.fieldTempId.localeCompare(right.fieldTempId),
  );
}

export const __testing = {
  buildFieldDedupKey,
  serializeGroupingKey,
  normalizeText,
};
