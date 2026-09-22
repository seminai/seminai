import AdmZip from 'adm-zip';
import { parseShapefile, type ShapefileExtractionResult } from '../shapefile-parser';

export class ShapefileUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShapefileUploadError';
  }
}

export interface ShapefileUploadInput {
  readonly buffer: Buffer;
  readonly fileName: string;
  readonly mimeType?: string;
  readonly companionDbf?: Buffer;
}

export async function parseShapefileUpload(
  input: ShapefileUploadInput,
): Promise<ShapefileExtractionResult> {
  const { shp, dbf } = extractShpDbfBuffers(input);
  return parseShapefile(shp, dbf);
}

export function buildShapefileZipBuffer(
  shpBuffer: Buffer,
  shpFileName: string,
  dbfBuffer: Buffer,
  dbfFileName: string,
): Buffer {
  const zip = new AdmZip();
  zip.addFile(shpFileName, shpBuffer);
  zip.addFile(dbfFileName, dbfBuffer);
  return zip.toBuffer();
}

function extractShpDbfBuffers(input: ShapefileUploadInput): { shp: Buffer; dbf: Buffer } {
  const lowerName = input.fileName.toLowerCase();
  if (lowerName.endsWith('.zip') || input.mimeType?.includes('zip')) {
    return extractFromZip(input.buffer);
  }
  if (lowerName.endsWith('.shp')) {
    if (!input.companionDbf) {
      throw new ShapefileUploadError('Shapefile incomplete: .dbf file required');
    }
    return { shp: input.buffer, dbf: input.companionDbf };
  }
  throw new ShapefileUploadError(
    'Unsupported shapefile upload: provide a ZIP archive or .shp with .dbf',
  );
}

function extractFromZip(buffer: Buffer): { shp: Buffer; dbf: Buffer } {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const shpEntry = entries.find((entry) => entry.entryName.toLowerCase().endsWith('.shp'));
  const dbfEntry = entries.find((entry) => entry.entryName.toLowerCase().endsWith('.dbf'));
  if (!shpEntry || !dbfEntry) {
    throw new ShapefileUploadError('ZIP must contain .shp and .dbf files');
  }
  return { shp: shpEntry.getData(), dbf: dbfEntry.getData() };
}
