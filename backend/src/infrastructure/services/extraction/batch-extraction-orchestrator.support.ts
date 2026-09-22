import path from 'node:path';
import fsp from 'node:fs/promises';
import { type ResolvedCategory, type BatchExtractionCategory, type ExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { ExtractDataFromInvoiceService } from '../tool/extractDataFromInvoice';
import { ExtractDataFromDdtService } from '../tool/extractDataFromDDT';
import { parseShapefileUpload } from './shapefile-upload-parser';
import { extractAgriculturalZipTables } from './agricultural-zip-table-extractor';


export interface MulterFileInput {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
}


export interface StartBatchParams {
  readonly files: readonly MulterFileInput[];
  readonly categories: readonly BatchExtractionCategory[];
  readonly companyId: string;
  readonly userId: string;
}


export interface BatchExtractionDependencies {
  readonly invoiceServiceFactory?: () => ExtractDataFromInvoiceService;
  readonly ddtServiceFactory?: () => ExtractDataFromDdtService;
}


export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath);
  } catch {
    /* file already removed or inaccessible — nothing to do */
  }
}


export function assertUsefulExtraction(data: ExtractionData, category: ResolvedCategory): void {
  if (data.extractedCount > 0) return;
  const fallbackCount = countExtractedItems(data);
  if (fallbackCount > 0) return;
  throw new Error(`No usable ${category} data extracted from file`);
}


export function countExtractedItems(data: ExtractionData): number {
  if ('entries' in data && Array.isArray(data.entries)) {
    return data.entries.length;
  }
  if ('fields' in data && 'productionUnits' in data) {
    return data.fields.length + data.productionUnits.length;
  }
  if ('fields' in data && Array.isArray(data.fields)) {
    return data.fields.length;
  }
  if ('productionUnits' in data && Array.isArray(data.productionUnits)) {
    return data.productionUnits.length;
  }
  return 0;
}


export function sanitizeTempFileName(fileName: string): string {
  const extension = path.extname(fileName).replace(/[^a-zA-Z0-9.]/g, '');
  const baseName = path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  return `${baseName || 'document'}${extension}`;
}


export async function parseShapefileUploadOrZipTables(
  file: MulterFileInput,
): Promise<
  | Awaited<ReturnType<typeof parseShapefileUpload>>
  | Awaited<ReturnType<typeof extractAgriculturalZipTables>>
> {
  try {
    return await parseShapefileUpload({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
  } catch (error) {
    if (!isZipUpload(file)) throw error;
    return extractAgriculturalZipTables(file.buffer);
  }
}


export function isZipUpload(file: MulterFileInput): boolean {
  const lowerName = file.originalname.toLowerCase();
  return (
    lowerName.endsWith('.zip') ||
    file.mimetype === 'application/zip' ||
    file.mimetype === 'application/x-zip-compressed'
  );
}
