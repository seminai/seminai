/**
 * Tool: extract_from_file
 * Extracts data from uploaded files (CSV/Excel/PDF/Shapefile/ZIP) with automatic type detection.
 * Non-destructive: produces a preview without persisting to the database.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { hasWorkingMemoryData, getWorkingMemory } from '../working-memory';
import { handlePdfFile } from './pdf-extractor';
import { handleCsvExcelFile } from './csv-excel-extractor';
import {
  isZipWithShapefile,
  isShapefileMultiUpload,
  handleShapefileFromZip,
  handleShapefileFromMultipleFiles,
} from './shapefile-handler';
import { isPcgGeojsonFile, handlePcgGeojsonFile } from './pcg-geojson-handler';

const PDF_MIME_TYPES = new Set(['application/pdf']);
const CSV_EXCEL_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);
const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
]);

function isZipFile(mimeType: string, fileName: string): boolean {
  return ZIP_MIME_TYPES.has(mimeType) || fileName.toLowerCase().endsWith('.zip');
}

function isShapefileComponent(fileName: string): boolean {
  return /\.(shp|dbf|shx|prj|cpg)$/i.test(fileName);
}

export function createExtractFromFileTool(threadId: string, userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'extract_from_file',
    description: `Estrae dati da file caricati dall'utente (CSV, Excel, PDF, Shapefile, PCG GeoJSON, ZIP con Shapefile) con rilevamento automatico del tipo.
NON crea nulla nel database — produce solo un'anteprima dei dati estratti.
Il sistema rileva automaticamente se il file contiene dati agricoli (campi e UP), dati magazzino (prodotti, DDT, fatture), shapefile (poligoni e appezzamenti), o PCG GeoJSON Veneto.
Supporta: singolo file, ZIP con shapefile, o più file shapefile (.shp + .dbf) caricati insieme.
Dopo l'estrazione, presenta un riepilogo all'utente e chiedi conferma prima di importare.
NON chiedere all'utente che tipo di file è: il sistema lo rileva automaticamente.`,
    schema: z.object({
      extractionType: z
        .enum(['all', 'company', 'fields', 'production_units', 'stock'])
        .optional()
        .default('all')
        .describe('Tipo di estrazione. "all" auto-rileva. "stock" forza estrazione magazzino.'),
    }),
    func: async ({ extractionType }) => {
      try {
        const wm = getWorkingMemory(threadId);
        const hasMultiFiles =
          wm.uploadedFiles && Array.isArray(wm.uploadedFiles) && wm.uploadedFiles.length > 0;
        const hasSingleFile = hasWorkingMemoryData(threadId, 'uploadedFileBuffer');

        if (!hasSingleFile && !hasMultiFiles) {
          return JSON.stringify({
            error: 'Nessun file caricato trovato.',
            hint: "L'utente deve allegare un file (CSV, Excel, PDF, Shapefile o ZIP) al messaggio.",
          });
        }

        if (hasMultiFiles) {
          const files = wm.uploadedFiles as ReadonlyArray<{
            buffer: Buffer;
            mimeType: string;
            fileName: string;
          }>;

          if (isShapefileMultiUpload(files)) {
            return handleShapefileFromMultipleFiles(threadId, files);
          }

          if (files.length === 1) {
            return processSingleFile(
              threadId,
              userId,
              files[0].buffer,
              files[0].mimeType,
              files[0].fileName,
              extractionType,
            );
          }

          return JSON.stringify({
            error: 'Più file caricati ma non sono componenti shapefile (.shp + .dbf).',
            hint: 'Per shapefile caricare almeno .shp e .dbf. Per altri formati caricare un singolo file.',
          });
        }

        const fileBuffer = wm.uploadedFileBuffer as Buffer;
        const mimeType = (wm.uploadedFileMimeType as string) || 'application/octet-stream';
        const fileName = (wm.uploadedFileName as string) || 'file';

        return processSingleFile(threadId, userId, fileBuffer, mimeType, fileName, extractionType);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

async function processSingleFile(
  threadId: string,
  userId: string,
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
  extractionType: string,
): Promise<string> {
  if (isZipFile(mimeType, fileName) && isZipWithShapefile(fileBuffer)) {
    return handleShapefileFromZip(threadId, fileBuffer, fileName);
  }

  if (isShapefileComponent(fileName)) {
    return JSON.stringify({
      error: `File shapefile singolo (${fileName}) non sufficiente.`,
      hint: 'Per importare shapefile servono almeno .shp e .dbf insieme. Carica un file ZIP o più file contemporaneamente.',
    });
  }

  if (isPcgGeojsonFile(fileName, mimeType)) {
    return handlePcgGeojsonFile(threadId, fileBuffer, fileName);
  }

  const isPdf = PDF_MIME_TYPES.has(mimeType) || fileName.toLowerCase().endsWith('.pdf');
  const isCsvExcel = CSV_EXCEL_MIME_TYPES.has(mimeType) || /\.(csv|xls|xlsx)$/i.test(fileName);

  if (!isPdf && !isCsvExcel) {
    return JSON.stringify({
      error: `Tipo file non supportato: ${mimeType} (${fileName})`,
      hint: 'Formati supportati: CSV, XLS, XLSX, PDF, GeoJSON PCG (.geojson), ZIP (con shapefile), Shapefile (.shp + .dbf).',
    });
  }

  if (isPdf) return handlePdfFile(threadId, fileBuffer, fileName, userId);

  return handleCsvExcelFile(
    threadId,
    fileBuffer,
    fileName,
    extractionType,
    extractionType === 'stock',
  );
}
