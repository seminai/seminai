import type {
  ProductionUnitPreview,
  ProductionUnitPreview as Preview,
} from '../../../../domain/dtos/file-extraction.dto';
import { parseVenetoPcgParticelle } from './veneto-pcg-particelle-parser';
import { roundPcgArea } from './veneto-pcg-number-utils';
import type {
  VenetoPcgFieldRecord,
  VenetoPcgProductionRow,
  VenetoPcgUnmatchedReference,
} from './veneto-pcg-types';

interface BuildResult {
  readonly productionUnits: readonly ProductionUnitPreview[];
  readonly unmatchedReferences: readonly VenetoPcgUnmatchedReference[];
}

interface MatchedReference {
  readonly row: VenetoPcgProductionRow;
  readonly field: VenetoPcgFieldRecord;
}

interface UnmatchedAllocationReference {
  readonly row: VenetoPcgProductionRow;
  readonly unmatched: VenetoPcgUnmatchedReference;
}

type AllocationReference = MatchedReference | UnmatchedAllocationReference;

export function buildVenetoPcgProductionUnits(
  fields: readonly VenetoPcgFieldRecord[],
  rows: readonly VenetoPcgProductionRow[],
): BuildResult {
  const fieldIndex = buildFieldIndex(fields);
  const productionUnits: Preview[] = [];
  const unmatchedReferences: VenetoPcgUnmatchedReference[] = [];
  for (const row of rows) {
    const { matches, unmatched } = matchRowReferences(row, fieldIndex);
    unmatchedReferences.push(...unmatched);
    const references: AllocationReference[] = [
      ...matches,
      ...unmatched.map((entry) => ({ row, unmatched: entry })),
    ];
    if (references.length === 0) continue;
    productionUnits.push(toProductionUnitPreview(row, references));
  }
  return { productionUnits, unmatchedReferences };
}

function matchRowReferences(
  row: VenetoPcgProductionRow,
  fieldIndex: ReadonlyMap<string, VenetoPcgFieldRecord>,
): {
  readonly matches: readonly MatchedReference[];
  readonly unmatched: readonly VenetoPcgUnmatchedReference[];
} {
  const refs = parseVenetoPcgParticelle(row.particelle);
  if (refs.length === 0) {
    return {
      matches: [],
      unmatched: [toUnmatched(row, '', null, null, '', '', 'invalid_particelle')],
    };
  }
  const matches: MatchedReference[] = [];
  const unmatched: VenetoPcgUnmatchedReference[] = [];
  for (const ref of refs) {
    const key = buildFieldKey(ref.codiceNazionale, ref.foglio, ref.particella);
    const field = key ? fieldIndex.get(key) : null;
    if (field) {
      matches.push({ row, field });
    } else {
      unmatched.push(
        toUnmatched(
          row,
          ref.comune,
          ref.codiceNazionale,
          ref.sezione,
          ref.foglio,
          ref.particella,
          ref.codiceNazionale ? 'missing_field' : 'unknown_comune',
        ),
      );
    }
  }
  return { matches, unmatched };
}

function toProductionUnitPreview(
  row: VenetoPcgProductionRow,
  references: readonly AllocationReference[],
): ProductionUnitPreview {
  const allocations = allocateArea(row, references);
  const cycle = {
    cycleIndex: 1,
    cropName: row.cropName,
    cropType: row.cropType,
    cropCode: row.cropCode,
    variety: row.variety,
    protocoll: row.cropCode,
    protectionStructure: row.protectionStructure,
    startDate: row.startDate,
    endDate: row.endDate,
    occupazione: row.uso,
    destinazione: null,
  };
  return {
    name: `${row.cropName} - ${row.idPoligono ?? `row ${row.rowNumber}`}`,
    cropName: row.cropName,
    cropType: row.cropType,
    variety: row.variety,
    protocoll: row.cropCode,
    protectionStructure: row.protectionStructure,
    startDate: row.startDate,
    endDate: row.endDate,
    areaHa: row.areaHa,
    cycles: [cycle],
    fieldAllocations: allocations,
  };
}

function allocateArea(row: VenetoPcgProductionRow, references: readonly AllocationReference[]) {
  const matchedSurface = references.reduce(
    (sum, reference) => ('field' in reference ? sum + reference.field.surfaceMq : sum),
    0,
  );
  let allocated = 0;
  return references.map((reference, index) => {
    const isLast = index === references.length - 1;
    const proportional =
      'field' in reference && matchedSurface > 0
        ? row.areaHa * (reference.field.surfaceMq / matchedSurface)
        : row.areaHa / references.length;
    const areaHa = isLast ? roundPcgArea(row.areaHa - allocated) : roundPcgArea(proportional);
    allocated = roundPcgArea(allocated + areaHa);
    return 'field' in reference
      ? toMatchedAllocation(reference.field, areaHa)
      : toUnmatchedAllocation(reference.unmatched, areaHa);
  });
}

function toMatchedAllocation(field: VenetoPcgFieldRecord, areaHa: number) {
  return {
    fieldName: field.field.name,
    sezione: field.field.sezione,
    foglio: field.field.foglio,
    particella: field.field.particella,
    subalterno: field.field.subalterno,
    comune: field.field.city,
    codiceNazionale: field.codiceNazionale,
    areaHa,
  };
}

function toUnmatchedAllocation(reference: VenetoPcgUnmatchedReference, areaHa: number) {
  return {
    fieldName: null,
    sezione: reference.sezione,
    foglio: reference.foglio || null,
    particella: reference.particella || null,
    subalterno: null,
    comune: reference.comune || null,
    codiceNazionale: reference.codiceNazionale,
    areaHa,
  };
}

function buildFieldIndex(
  fields: readonly VenetoPcgFieldRecord[],
): ReadonlyMap<string, VenetoPcgFieldRecord> {
  const index = new Map<string, VenetoPcgFieldRecord>();
  for (const field of fields) {
    const key = buildFieldKey(
      field.codiceNazionale,
      field.field.foglio ?? '',
      field.field.particella ?? '',
    );
    if (key) index.set(key, field);
  }
  return index;
}

function buildFieldKey(
  codiceNazionale: string | null,
  foglio: string,
  particella: string,
): string | null {
  if (!codiceNazionale || !foglio || !particella) return null;
  return `${codiceNazionale}|${foglio}|${particella}`;
}

function toUnmatched(
  row: VenetoPcgProductionRow,
  comune: string,
  codiceNazionale: string | null,
  sezione: string | null,
  foglio: string,
  particella: string,
  reason: VenetoPcgUnmatchedReference['reason'],
): VenetoPcgUnmatchedReference {
  return {
    rowNumber: row.rowNumber,
    sourceFileName: row.sourceFileName,
    particelle: row.particelle,
    comune,
    codiceNazionale,
    sezione,
    foglio,
    particella,
    reason,
  };
}
