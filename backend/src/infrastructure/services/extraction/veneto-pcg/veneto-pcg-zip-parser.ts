import path from 'node:path';
import AdmZip from 'adm-zip';
import { parseVenetoPcgFields } from './veneto-pcg-field-parser';
import { parseVenetoPcgExcel } from './veneto-pcg-excel-parser';
import { buildVenetoPcgProductionUnits } from './veneto-pcg-allocation-builder';
import { enrichVenetoPcgFieldsWithCrop } from './veneto-pcg-field-enrichment';
import type {
  VenetoPcgDiagnostics,
  VenetoPcgExtractionResult,
  VenetoPcgProductionRow,
} from './veneto-pcg-types';

interface VenetoPcgZipEntries {
  readonly particelleShp: AdmZip.IZipEntry;
  readonly particelleDbf: AdmZip.IZipEntry;
  readonly attributiExcel: readonly AdmZip.IZipEntry[];
}

export function isVenetoPcgZip(buffer: Buffer): boolean {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
    return findRequiredEntries(entries) !== null;
  } catch {
    return false;
  }
}

export async function parseVenetoPcgZip(buffer: Buffer): Promise<VenetoPcgExtractionResult> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const required = findRequiredEntries(entries);
  if (!required) {
    throw new Error(
      'Veneto PCG ZIP must contain PARTICELLE_CONDOTTE.shp/.dbf and ATTRIBUTI_PCG*.xlsx',
    );
  }
  const fieldRecords = await parseVenetoPcgFields(
    required.particelleShp.getData(),
    required.particelleDbf.getData(),
  );
  const excelResults = required.attributiExcel.map((entry) =>
    parseVenetoPcgExcel(entry.getData(), path.basename(entry.entryName)),
  );
  const productionRows = excelResults.flatMap((result) => result.rows);
  const built = buildVenetoPcgProductionUnits(fieldRecords, productionRows);
  const rawFields = fieldRecords.map((record) => record.field);
  const enrichedFields = enrichVenetoPcgFieldsWithCrop(rawFields, built.productionUnits);
  const diagnostics = buildDiagnostics({
    fields: fieldRecords.length,
    productionRows,
    excelRows: excelResults.reduce((sum, result) => sum + result.totalRows, 0),
    productionUnits: built.productionUnits.length,
    unmatchedReferences: built.unmatchedReferences,
    sourceFiles: [
      path.basename(required.particelleShp.entryName),
      path.basename(required.particelleDbf.entryName),
      ...required.attributiExcel.map((entry) => path.basename(entry.entryName)),
    ],
  });
  return {
    fields: enrichedFields,
    productionUnits: built.productionUnits,
    diagnostics,
  };
}

function findRequiredEntries(entries: readonly AdmZip.IZipEntry[]): VenetoPcgZipEntries | null {
  const particelleShp = findByBaseName(entries, 'particelle_condotte.shp');
  const particelleDbf = findByBaseName(entries, 'particelle_condotte.dbf');
  const attributiExcel = entries.filter((entry) => {
    const name = path.basename(entry.entryName).toLowerCase();
    return name.startsWith('attributi_pcg') && name.endsWith('.xlsx');
  });
  if (!particelleShp || !particelleDbf || attributiExcel.length === 0) return null;
  return { particelleShp, particelleDbf, attributiExcel };
}

function findByBaseName(
  entries: readonly AdmZip.IZipEntry[],
  expectedName: string,
): AdmZip.IZipEntry | null {
  return (
    entries.find((entry) => path.basename(entry.entryName).toLowerCase() === expectedName) ?? null
  );
}

function buildDiagnostics(input: {
  readonly fields: number;
  readonly productionRows: readonly VenetoPcgProductionRow[];
  readonly excelRows: number;
  readonly productionUnits: number;
  readonly unmatchedReferences: VenetoPcgDiagnostics['unmatchedReferences'];
  readonly sourceFiles: readonly string[];
}): VenetoPcgDiagnostics {
  return {
    source: 'veneto_pcg_zip',
    fields: input.fields,
    productionUnits: input.productionUnits,
    excelRows: input.excelRows,
    productiveRows: input.productionRows.length,
    unmatchedReferences: input.unmatchedReferences,
    sourceFiles: input.sourceFiles,
    totalRecords: input.fields,
    shapeType: 'Polygon',
    sourceCrs: 'EPSG:3003',
  };
}
