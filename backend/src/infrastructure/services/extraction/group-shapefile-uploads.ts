import { type BatchExtractionCategory } from '../../../domain/dtos/file-extraction.dto';
import { buildShapefileZipBuffer } from './shapefile-upload-parser';

export interface MulterFileInput {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
}

export interface GroupedShapefileUpload {
  readonly file: MulterFileInput;
  readonly category: BatchExtractionCategory;
}

const SIDECAR_EXTENSIONS = new Set(['.dbf', '.shx', '.prj', '.cpg', '.sbn', '.sbx']);

function getExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  const dotIndex = lower.lastIndexOf('.');
  return dotIndex >= 0 ? lower.slice(dotIndex) : '';
}

function getBasename(fileName: string): string {
  const lower = fileName.toLowerCase();
  const dotIndex = lower.lastIndexOf('.');
  return dotIndex >= 0 ? lower.slice(0, dotIndex) : lower;
}

function isZipFile(file: MulterFileInput): boolean {
  const lower = file.originalname.toLowerCase();
  return lower.endsWith('.zip') || file.mimetype.includes('zip');
}

/**
 * Groups multi-file shapefile uploads (.shp + .dbf + sidecars) into a single
 * logical upload per basename. Sidecar-only entries are omitted from output.
 */
export function groupShapefileUploads(
  files: readonly MulterFileInput[],
  categories: readonly BatchExtractionCategory[],
): GroupedShapefileUpload[] {
  const consumed = new Set<number>();
  const grouped: GroupedShapefileUpload[] = [];

  for (let index = 0; index < files.length; index += 1) {
    if (isZipFile(files[index])) {
      grouped.push({ file: files[index], category: categories[index] ?? 'auto' });
      consumed.add(index);
    }
  }

  const byBasename = new Map<string, number[]>();
  for (let index = 0; index < files.length; index += 1) {
    if (consumed.has(index)) continue;
    const basename = getBasename(files[index].originalname);
    const bucket = byBasename.get(basename) ?? [];
    bucket.push(index);
    byBasename.set(basename, bucket);
  }

  for (const [basename, indices] of byBasename) {
    const shpIndex = indices.find((index) => getExtension(files[index].originalname) === '.shp');
    if (shpIndex === undefined) {
      for (const index of indices) {
        if (SIDECAR_EXTENSIONS.has(getExtension(files[index].originalname))) {
          consumed.add(index);
          continue;
        }
        grouped.push({ file: files[index], category: categories[index] ?? 'auto' });
        consumed.add(index);
      }
      continue;
    }

    const dbfIndex = indices.find((index) => getExtension(files[index].originalname) === '.dbf');
    if (dbfIndex !== undefined) {
      const shpFile = files[shpIndex];
      const dbfFile = files[dbfIndex];
      grouped.push({
        file: {
          buffer: buildShapefileZipBuffer(
            shpFile.buffer,
            shpFile.originalname,
            dbfFile.buffer,
            dbfFile.originalname,
          ),
          originalname: `${basename}.zip`,
          mimetype: 'application/zip',
        },
        category: categories[shpIndex] ?? 'auto',
      });
      for (const index of indices) consumed.add(index);
      continue;
    }

    grouped.push({ file: files[shpIndex], category: categories[shpIndex] ?? 'auto' });
    consumed.add(shpIndex);
    for (const index of indices) {
      if (index === shpIndex) continue;
      if (SIDECAR_EXTENSIONS.has(getExtension(files[index].originalname))) {
        consumed.add(index);
        continue;
      }
      grouped.push({ file: files[index], category: categories[index] ?? 'auto' });
      consumed.add(index);
    }
  }

  return grouped;
}
