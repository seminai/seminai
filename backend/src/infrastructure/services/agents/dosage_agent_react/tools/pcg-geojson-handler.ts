/**
 * PCG GeoJSON extraction handler for extract_from_file tool.
 * Handles Veneto Piano Colturale Grafico exports (EPSG:32632).
 */
import { parsePcgGeojson } from '../../../pcg-geojson-parser';
import { updateWorkingMemory } from '../working-memory';
import type { FieldExtracted, ProductionUnitExtracted } from './file-extraction-types';
import {
  mapShapefileFieldToExtracted,
  mapShapefileProductionUnitToExtracted,
} from './geo-field-mappers';

const GEOJSON_MIME_TYPES = new Set([
  'application/geo+json',
  'application/json',
  'application/octet-stream',
]);

export function isPcgGeojsonFile(fileName: string, mimeType: string): boolean {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.geojson')) return true;
  if (lowerName.startsWith('pcg_') && lowerName.endsWith('.json')) return true;
  return GEOJSON_MIME_TYPES.has(mimeType) && lowerName.endsWith('.json');
}

function buildPcgGeojsonResponse(
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

  const campi = fields.map((f, i) => ({
    n: i + 1,
    nome: f.name ?? `Campo ${i + 1}`,
    foglio: f.foglio ?? '-',
    particella: f.particella ?? '-',
    sezione: f.sezione ?? '',
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
    source: 'PCG GeoJSON',
    detectedFileType: 'agricultural',
    detectionReason: `PCG GeoJSON (${diagnostics.sourceCrs}, ${diagnostics.totalRecords} features)`,
    fileName,
    documentCategory: 'PIANO_COLTURALE',
    fieldsExtracted: fields.length,
    productionUnitsExtracted: productionUnits.length,
    campi,
    unitaProduttive,
    diagnostics,
    workingMemoryKey: 'extractedFileData',
    importTool: 'import_from_file',
    hasCadastralData: true,
    message: `Estratti ${fields.length} campi e ${productionUnits.length} unità produttive da "${fileName}" (PCG GeoJSON Veneto). Presenta i campi in tabella e chiedi conferma prima di procedere.`,
  });
}

export async function handlePcgGeojsonFile(
  threadId: string,
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const result = await parsePcgGeojson(buffer);
  const fields = result.fields.map(mapShapefileFieldToExtracted);
  const productionUnits = result.productionUnits.map(mapShapefileProductionUnitToExtracted);
  return buildPcgGeojsonResponse(threadId, fileName, fields, productionUnits, result.diagnostics);
}
