/**
 * Maps production units from working memory onto InputDosageAgent.unitOfProduction.
 * Region/city come from the unit or nested field; disciplinari default to [region].
 */

export interface JobUnitSource {
  readonly id?: string;
  readonly unitProductionId?: string;
  readonly productionUnitId?: string;
  readonly cropName?: string;
  readonly variety?: string | null;
  readonly cropVariety?: string | null;
  readonly areaHa?: number | null;
  readonly startDate?: string | Date | null;
  readonly endDate?: string | Date | null;
  readonly region?: string | null;
  readonly city?: string | null;
  readonly disciplinari?: readonly string[] | null;
  readonly field?: { readonly region?: string | null; readonly city?: string | null } | null;
}

export interface JobUnitInput {
  readonly id: string;
  readonly cropName: string;
  readonly variety: string;
  readonly areaHa?: number;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly region?: string;
  readonly city?: string;
  readonly disciplinari: string[];
  readonly cropVariety: string;
}

function trimOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function toDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function resolveUnitRegion(unit: JobUnitSource): string | undefined {
  return trimOrUndefined(unit.region) ?? trimOrUndefined(unit.field?.region);
}

export function resolveUnitCity(unit: JobUnitSource): string | undefined {
  return trimOrUndefined(unit.city) ?? trimOrUndefined(unit.field?.city);
}

export function resolveUnitDisciplinari(unit: JobUnitSource): string[] {
  const explicit = [...(unit.disciplinari ?? [])]
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  if (explicit.length > 0) {
    return [...new Set(explicit)];
  }
  const region = resolveUnitRegion(unit);
  return region ? [region] : [];
}

export function mapUnitToJobInput(unit: JobUnitSource): JobUnitInput {
  const region = resolveUnitRegion(unit);
  const city = resolveUnitCity(unit);
  return {
    id: unit.id ?? unit.unitProductionId ?? unit.productionUnitId ?? '',
    cropName: unit.cropName ?? '',
    variety: unit.variety ?? unit.cropVariety ?? '',
    areaHa: unit.areaHa ?? undefined,
    startDate: toDate(unit.startDate),
    endDate: toDate(unit.endDate),
    ...(region ? { region } : {}),
    ...(city ? { city } : {}),
    disciplinari: resolveUnitDisciplinari(unit),
    cropVariety: unit.cropVariety ?? unit.variety ?? '',
  };
}

export function mapUnitsToJobInput(units: readonly JobUnitSource[]): JobUnitInput[] {
  return units.map(mapUnitToJobInput);
}

function unitKey(unit: JobUnitSource): string {
  return unit.id ?? unit.unitProductionId ?? unit.productionUnitId ?? '';
}

export function mergeJobUnitSources(
  incoming: readonly JobUnitSource[],
  existing: readonly JobUnitSource[],
): JobUnitSource[] {
  const byId = new Map(
    existing.map((unit) => [unitKey(unit), unit] as const).filter((entry) => entry[0].length > 0),
  );
  return incoming.map((unit) => {
    const previous = byId.get(unitKey(unit));
    if (!previous) {
      return unit;
    }
    const region = resolveUnitRegion(unit) ?? resolveUnitRegion(previous);
    const city = resolveUnitCity(unit) ?? resolveUnitCity(previous);
    const disciplinari = resolveUnitDisciplinari({
      ...unit,
      region,
      disciplinari:
        resolveUnitDisciplinari(unit).length > 0
          ? resolveUnitDisciplinari(unit)
          : resolveUnitDisciplinari(previous),
    });
    return {
      ...previous,
      ...unit,
      ...(region ? { region } : {}),
      ...(city ? { city } : {}),
      disciplinari,
      field: unit.field ?? previous.field,
    };
  });
}

export function toWorkingMemoryUnit(unit: {
  readonly id: string;
  readonly name: string;
  readonly cropName: string;
  readonly variety: string | null;
  readonly areaHa: number | null;
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly startDate?: string | Date | null;
  readonly endDate?: string | Date | null;
  readonly floweringDate?: string | Date | null;
  readonly harvestingDate?: string | Date | null;
  readonly region?: string | null;
  readonly city?: string | null;
  readonly field?: { readonly region?: string | null; readonly city?: string | null } | null;
}): Record<string, unknown> {
  const region = resolveUnitRegion(unit);
  const city = resolveUnitCity(unit);
  return {
    id: unit.id,
    name: unit.name,
    cropName: unit.cropName,
    variety: unit.variety,
    areaHa: unit.areaHa,
    companyId: unit.companyId,
    companyName: unit.companyName,
    startDate: toDate(unit.startDate),
    endDate: toDate(unit.endDate),
    floweringDate: toDate(unit.floweringDate),
    harvestingDate: toDate(unit.harvestingDate),
    ...(region ? { region } : {}),
    ...(city ? { city } : {}),
    disciplinari: resolveUnitDisciplinari(unit),
    ...(region || city ? { field: { region, city } } : {}),
  };
}
