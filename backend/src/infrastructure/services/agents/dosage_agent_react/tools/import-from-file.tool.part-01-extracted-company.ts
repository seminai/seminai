import { ProductionUnit } from '../../../../../domain/entities/ProductionUnit';
import { Field } from '../../../../../domain/entities/Field';
import { normalizeAreaHa } from '../../../../utils/area-normalization';

export interface ExtractedCompany {
  name: string;
  vatNumber: string | null;
  fiscalCode: string | null;
  cuaa: string | null;
  nation: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  cap: string | null;
}

export interface ExtractedField {
  nome?: string;
  name?: string;
  regione?: string | null;
  provincia?: string | null;
  comune?: string;
  indirizzo?: string | null;
  cap?: string | null;
  sezione?: string | null;
  foglio?: string;
  particella?: string;
  subalterno?: string | null;
  superficieCatastaleHa?: number | null;
  superficieGraficaHa?: number | null;
  superficieCatastaleMq?: number | null;
  sauHa?: number | null;
  gisHa?: number | null;
  usiSuolo?: string[];
  qualita?: string | null;
  coordinates?: number[];
  latitude?: number | null;
  longitude?: number | null;
  polygon?: { type: string; coordinates: number[][][] } | null;
  coordinatesGaussBoaga?: number[] | null;
  polygonGaussBoaga?: { type: string; coordinates: number[][][] } | null;
  nation?: string | null;
  region?: string | null;
  soilType?: string | null;
  inizioConduzione?: string | null;
  fineConduzione?: string | null;
}

export interface ExtractedPU {
  name: string;
  sezione?: string | null;
  foglio?: string | null;
  particella?: string | null;
  subalterno?: string | null;
  areaHa?: number | null;
  protocoll?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  fieldIndex?: number;
  cropType?: string | null;
  protectionStructure?: string | null;
  destinazioneDiUso?: string | null;
  cycles?: Array<{
    cycleIndex?: number;
    cropName?: string | null;
    cropType?: string | null;
    variety?: string | null;
    occupazione?: string | null;
    destinazione?: string | null;
    protectionStructure?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    floweringDate?: string | null;
    harvestingDate?: string | null;
  }>;
  allocations?: Array<{
    fieldName?: string;
    sezione?: string | null;
    foglio?: string | null;
    particella?: string | null;
    subalterno?: string | null;
    areaHa?: number;
  }>;
}

export interface ProductionUnitImportEntry {
  readonly productionUnit: ProductionUnit;
  readonly allocations: Array<{ fieldId: string; areaHaOnField: number }>;
}

export function buildFieldEntities(params: {
  readonly fields: ExtractedField[];
  readonly companyId: string | null;
  readonly skippedIndexes: ReadonlySet<number>;
  readonly reusedIds: ReadonlyMap<number, string>;
}): { readonly entities: Field[]; readonly originalIndexes: number[] } {
  const { fields, companyId, skippedIndexes, reusedIds } = params;
  const selected = fields
    .map((value, originalIndex) => ({ value, originalIndex }))
    .filter(({ originalIndex }) => !skippedIndexes.has(originalIndex) && !reusedIds.has(originalIndex));
  const entities = selected.map(({ value: field }) => {
    const hasCadastral = field.foglio || field.particella;
    const name =
      field.nome ||
      field.name ||
      (hasCadastral
        ? `F${field.foglio ?? '?'} P${field.particella ?? '?'}`
        : `Campo ${fields.indexOf(field) + 1}`);
    const cadastralSquareMeters =
      field.superficieCatastaleMq ??
      (field.superficieCatastaleHa != null ? field.superficieCatastaleHa * 10000 : null);
    return Field.create({
      companyId,
      name,
      coordinates: field.coordinates ?? [],
      coordinatesGaussBoaga: field.coordinatesGaussBoaga ?? undefined,
      latitude: field.latitude ?? null,
      longitude: field.longitude ?? null,
      polygon: field.polygon ?? null,
      polygonGaussBoaga: field.polygonGaussBoaga ?? undefined,
      gisHa: field.gisHa ?? field.superficieGraficaHa ?? null,
      sauHa: field.sauHa ?? null,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
      soilType: field.soilType ?? null,
      uso: field.usiSuolo?.join(', ') ?? null,
      qualita: field.qualita ?? null,
      superficieCatastaleMq: cadastralSquareMeters,
      sezione: field.sezione ?? null,
      foglio: field.foglio ?? null,
      particella: field.particella ?? null,
      subalterno: field.subalterno ?? null,
      nation: field.nation ?? 'IT',
      region: field.region ?? field.provincia ?? field.regione ?? null,
      city: field.comune ?? null,
      address: field.indirizzo ?? null,
      cap: field.cap ?? null,
      variazioneMq: null,
      inizioConduzione: field.inizioConduzione ? new Date(field.inizioConduzione) : null,
      fineConduzione: field.fineConduzione ? new Date(field.fineConduzione) : null,
      bufferZoneNotes: null,
    });
  });
  return { entities, originalIndexes: selected.map(({ originalIndex }) => originalIndex) };
}

export function buildProductionUnitEntries(params: {
  readonly productionUnits: ExtractedPU[];
  readonly fieldMap: ReadonlyMap<string, string>;
  readonly companyId: string | null;
  readonly errors: Array<{ entity: string; error: string }>;
}): ProductionUnitImportEntry[] {
  const { productionUnits, fieldMap, companyId, errors } = params;
  const entries: ProductionUnitImportEntry[] = [];
  for (const unit of productionUnits) {
    const cycle = unit.cycles?.[0];
    const startDate = unit.startDate || cycle?.startDate;
    const endDate = unit.endDate || cycle?.endDate;
    if (!startDate || !endDate) {
      errors.push({ entity: `PU: ${unit.name}`, error: 'Date mancanti' });
      continue;
    }
    const allocations: Array<{ fieldId: string; areaHaOnField: number }> = [];
    if (unit.fieldIndex != null) {
      const fieldId = fieldMap.get(`__index_${unit.fieldIndex}`);
      if (fieldId) allocations.push({ fieldId, areaHaOnField: normalizeAreaHa(unit.areaHa) ?? 0 });
    } else if ((unit.allocations ?? []).length > 0) {
      for (const allocation of unit.allocations ?? []) {
        let fieldId = fieldMap.get(`${allocation.foglio}_${allocation.particella}`.toLowerCase());
        if (!fieldId && allocation.fieldName) {
          fieldId = fieldMap.get(
            `${allocation.fieldName}|${allocation.sezione ?? ''}|${allocation.foglio}|${allocation.particella}|${allocation.subalterno || ''}|${companyId || ''}`,
          );
        }
        if (!fieldId) {
          errors.push({
            entity: `PU: ${unit.name}`,
            error: `Campo F${allocation.foglio} P${allocation.particella} non trovato`,
          });
          continue;
        }
        allocations.push({ fieldId, areaHaOnField: normalizeAreaHa(allocation.areaHa) ?? 0 });
      }
    } else if (unit.foglio && unit.particella) {
      const fieldId = fieldMap.get(`${unit.foglio}_${unit.particella}`.toLowerCase());
      if (fieldId) allocations.push({ fieldId, areaHaOnField: normalizeAreaHa(unit.areaHa) ?? 0 });
    }
    if (allocations.length === 0) {
      errors.push({ entity: `PU: ${unit.name}`, error: 'Nessun campo associato trovato' });
      continue;
    }
    const totalArea = allocations.reduce((sum, allocation) => sum + allocation.areaHaOnField, 0);
    entries.push({
      productionUnit: ProductionUnit.create({
        name: unit.name,
        cropName: cycle?.cropName ?? 'Sconosciuta',
        cropType: cycle?.cropType ?? unit.cropType ?? 'N/A',
        variety: cycle?.variety ?? 'N/A',
        protocoll: cycle?.occupazione ?? unit.protocoll ?? 'Convenzionale',
        areaHa: totalArea > 0 ? totalArea : normalizeAreaHa(unit.areaHa) ?? 0,
        protectionStructure: cycle?.protectionStructure ?? unit.protectionStructure ?? 'Nessuna',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        floweringDate: cycle?.floweringDate ? new Date(cycle.floweringDate) : new Date(startDate),
        harvestingDate: cycle?.harvestingDate ? new Date(cycle.harvestingDate) : new Date(endDate),
        occupazione: cycle?.occupazione ?? null,
        destinazioneDiUso: cycle?.destinazione ?? unit.destinazioneDiUso ?? null,
        acquaTotalePeridoL: 0,
      }),
      allocations,
    });
  }
  return entries;
}
