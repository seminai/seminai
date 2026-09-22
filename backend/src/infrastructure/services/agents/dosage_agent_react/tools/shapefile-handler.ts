/**
 * Shapefile extraction handler for extract_from_file tool.
 * Handles: ZIP archives containing shapefiles, multiple uploaded shapefile components.
 */
import AdmZip from 'adm-zip';
import { parseShapefile } from '../../../shapefile-parser';
import { updateWorkingMemory } from '../working-memory';
import type { FieldExtracted, ProductionUnitExtracted } from './file-extraction-types';
import {
  mapShapefileFieldToExtracted,
  mapShapefileProductionUnitToExtracted,
} from './geo-field-mappers';

interface UploadedFile {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
}

/**
 * Checks whether a buffer is a ZIP archive containing at least .shp and .dbf files.
 */
export function isZipWithShapefile(buffer: Buffer): boolean {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return false;
  }
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let hasShp = false;
    let hasDbf = false;
    for (const entry of entries) {
      const name = entry.entryName.toLowerCase();
      if (name.endsWith('.shp')) hasShp = true;
      if (name.endsWith('.dbf')) hasDbf = true;
    }
    return hasShp && hasDbf;
  } catch {
    return false;
  }
}

/**
 * Checks whether a set of uploaded files contains shapefile components (.shp + .dbf).
 */
export function isShapefileMultiUpload(files: readonly UploadedFile[]): boolean {
  const names = files.map((f) => f.fileName.toLowerCase());
  return names.some((n) => n.endsWith('.shp')) && names.some((n) => n.endsWith('.dbf'));
}

function extractShpDbfFromZip(buffer: Buffer): { shp: Buffer; dbf: Buffer } {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  let shpEntry: AdmZip.IZipEntry | undefined;
  let dbfEntry: AdmZip.IZipEntry | undefined;

  for (const entry of entries) {
    const name = entry.entryName.toLowerCase();
    if (name.endsWith('.shp')) shpEntry = entry;
    if (name.endsWith('.dbf')) dbfEntry = entry;
  }

  if (!shpEntry || !dbfEntry) {
    throw new Error('ZIP does not contain required .shp and .dbf files');
  }

  return { shp: shpEntry.getData(), dbf: dbfEntry.getData() };
}

function buildShapefileResponse(
  threadId: string,
  fileName: string,
  fields: FieldExtracted[],
  productionUnits: ProductionUnitExtracted[],
  diagnostics: { totalRecords: number; shapeType: string; sourceCrs: string },
): string {
  updateWorkingMemory(threadId, {
    extractedFileData: { companies: [], fields, productionUnits },
    detectedFileType: 'agricultural',
  });

  const hasCadastralData = fields.some((f) => f.foglio || f.particella);

  const campi = fields.map((f, i) => ({
    n: i + 1,
    nome: f.name ?? `Campo ${i + 1}`,
    ...(hasCadastralData
      ? { foglio: f.foglio ?? '-', particella: f.particella ?? '-', sezione: f.sezione ?? '' }
      : {}),
    superficieHa: f.sauHa ?? f.gisHa ?? f.superficieCatastaleHa ?? null,
    comune: f.comune ?? 'N/A',
    uso: f.usiSuolo?.join(', ') ?? f.qualita ?? '',
    hasPolygon: !!f.polygon,
  }));

  const unitaProduttive = productionUnits.map((pu, i) => {
    const cycle = pu.cycles?.[0];
    const campoIdx = pu.fieldIndex;
    const campoNome =
      campoIdx != null && campoIdx < fields.length
        ? fields[campoIdx].name ?? `Campo ${campoIdx + 1}`
        : 'N/A';
    return {
      n: i + 1,
      nome: pu.name || 'N/A',
      coltura: cycle?.cropName ?? 'N/A',
      varieta: cycle?.variety ?? '',
      superficieHa: pu.areaHa ?? null,
      campoAssociato: campoNome,
      dataInizio: pu.startDate || cycle?.startDate || 'N/A',
      dataFine: pu.endDate || cycle?.endDate || 'N/A',
    };
  });

  return JSON.stringify({
    source: 'Shapefile',
    detectedFileType: 'agricultural',
    detectionReason: `Shapefile (${diagnostics.sourceCrs}, ${diagnostics.totalRecords} features)`,
    fileName,
    fieldsExtracted: fields.length,
    productionUnitsExtracted: productionUnits.length,
    campi,
    unitaProduttive,
    diagnostics,
    workingMemoryKey: 'extractedFileData',
    importTool: 'import_from_file',
    hasCadastralData,
    message: `Estratti ${fields.length} campi e ${productionUnits.length} unità produttive da "${fileName}" (Shapefile).${hasCadastralData ? '' : ' I dati catastali (foglio/particella) non sono presenti nello shapefile — le superfici estratte sono già SAU.'} Presenta i campi in tabella e chiedi conferma prima di procedere.`,
  });
}

/**
 * Extracts shapefile data from a ZIP archive.
 */
export async function handleShapefileFromZip(
  threadId: string,
  zipBuffer: Buffer,
  fileName: string,
): Promise<string> {
  const { shp, dbf } = extractShpDbfFromZip(zipBuffer);
  const result = await parseShapefile(shp, dbf);
  const fields = result.fields.map(mapShapefileFieldToExtracted);
  const productionUnits = result.productionUnits.map(mapShapefileProductionUnitToExtracted);
  return buildShapefileResponse(threadId, fileName, fields, productionUnits, result.diagnostics);
}

/**
 * Extracts shapefile data from multiple uploaded files (.shp + .dbf).
 */
export async function handleShapefileFromMultipleFiles(
  threadId: string,
  files: readonly UploadedFile[],
): Promise<string> {
  const shpFile = files.find((f) => f.fileName.toLowerCase().endsWith('.shp'));
  const dbfFile = files.find((f) => f.fileName.toLowerCase().endsWith('.dbf'));

  if (!shpFile || !dbfFile) {
    return JSON.stringify({
      error: 'Shapefile incompleto: servono almeno i file .shp e .dbf.',
      hint: 'Carica una cartella o un file ZIP contenente almeno .shp e .dbf.',
    });
  }

  const baseName = shpFile.fileName.replace(/\.shp$/i, '');
  const result = await parseShapefile(shpFile.buffer, dbfFile.buffer);
  const fields = result.fields.map(mapShapefileFieldToExtracted);
  const productionUnits = result.productionUnits.map(mapShapefileProductionUnitToExtracted);
  return buildShapefileResponse(threadId, baseName, fields, productionUnits, result.diagnostics);
}
