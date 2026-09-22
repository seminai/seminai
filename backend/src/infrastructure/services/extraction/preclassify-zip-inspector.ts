import path from 'node:path';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
import * as shapefile from 'shapefile';
import { type DocumentCategory } from '@prisma/client';
import { detectZipType } from '../agents/dosage_agent_react/tools/file-type-detector';
import { pdfToText } from '../ocr/pdfToText';
import { isVenetoPcgZip } from './veneto-pcg/veneto-pcg-zip-parser';

export interface ZipPreclassifyContext {
  readonly textPreview: string;
  readonly deterministicCategory: DocumentCategory | null;
  readonly categoryConfidence: number;
  readonly categoryReason: string;
}

const TRUNCATE_CHARS = Number(process.env.PRECLASSIFY_TEXT_TRUNCATE_CHARS ?? 2000);
const MAX_TEXT_ENTRIES = 8;
const MAX_ENTRY_BYTES = 512 * 1024;
const MAX_TOTAL_DECOMPRESSED_BYTES = 10 * 1024 * 1024;
const GEOJSON_PREVIEW_CHARS = 1500;
const DBF_SAMPLE_RECORDS = 2;
const XLSX_SAMPLE_ROWS = 3;

const TEXT_EXTENSIONS = new Set(['.csv', '.txt', '.xml', '.tsv']);
const PRIORITY_EXTENSIONS = ['.csv', '.xlsx', '.dbf', '.pdf', '.geojson', '.json', '.txt', '.xml'];

function truncate(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, TRUNCATE_CHARS);
}

function entryBaseName(entryName: string): string {
  const base = path.basename(entryName).toLowerCase();
  const dotIndex = base.lastIndexOf('.');
  return dotIndex >= 0 ? base.slice(0, dotIndex) : base;
}

function entryExtension(entryName: string): string {
  const base = path.basename(entryName).toLowerCase();
  const dotIndex = base.lastIndexOf('.');
  return dotIndex >= 0 ? base.slice(dotIndex) : '';
}

function isPcgGeoJsonName(entryName: string): boolean {
  const base = path.basename(entryName).toLowerCase();
  return base.endsWith('.geojson') || (base.startsWith('pcg_') && base.endsWith('.json'));
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function venetoPcgContext(fileName: string, entryNames: readonly string[]): ZipPreclassifyContext {
  const preview = truncate(
    [`fileName: ${fileName}`, 'zipKind: veneto_pcg', `entries: ${entryNames.join(', ')}`].join(
      '\n',
    ),
  );
  return {
    textPreview: preview,
    deterministicCategory: 'PIANO_COLTURALE',
    categoryConfidence: 1,
    categoryReason: 'Veneto PCG ZIP contains PARTICELLE_CONDOTTE and ATTRIBUTI_PCG',
  };
}

function fallbackContext(fileName: string, entryNames: readonly string[]): ZipPreclassifyContext {
  return {
    textPreview: truncate(
      [`fileName: ${fileName}`, `entries: ${entryNames.join(', ')}`].join('\n'),
    ),
    deterministicCategory: null,
    categoryConfidence: 0,
    categoryReason: '',
  };
}

function sortEntriesForPreview(entries: readonly AdmZip.IZipEntry[]): AdmZip.IZipEntry[] {
  return [...entries].sort((left, right) => {
    const leftPriority = PRIORITY_EXTENSIONS.indexOf(entryExtension(left.entryName));
    const rightPriority = PRIORITY_EXTENSIONS.indexOf(entryExtension(right.entryName));
    const leftRank = leftPriority >= 0 ? leftPriority : PRIORITY_EXTENSIONS.length;
    const rightRank = rightPriority >= 0 ? rightPriority : PRIORITY_EXTENSIONS.length;
    return leftRank - rightRank;
  });
}

function readTextEntry(data: Buffer): string {
  return data.toString('utf8').replace(/\0/g, ' ').trim();
}

function readXlsxPreview(data: Buffer, entryName: string): string {
  const workbook = XLSX.read(data, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const sample = rows.slice(0, XLSX_SAMPLE_ROWS);
  return `${entryName}: ${JSON.stringify(sample)}`;
}

async function readDbfPreview(
  entries: readonly AdmZip.IZipEntry[],
  dbfEntry: AdmZip.IZipEntry,
): Promise<string | null> {
  const dbfBase = entryBaseName(dbfEntry.entryName);
  const shpEntry = entries.find(
    (entry) =>
      entryBaseName(entry.entryName) === dbfBase && entry.entryName.toLowerCase().endsWith('.shp'),
  );
  if (!shpEntry) return null;
  try {
    const source = await shapefile.open(
      toArrayBuffer(shpEntry.getData()),
      toArrayBuffer(dbfEntry.getData()),
      { encoding: 'latin1' },
    );
    const records: string[] = [];
    for (let index = 0; index < DBF_SAMPLE_RECORDS; index += 1) {
      const next = await source.read();
      if (next.done || !next.value) break;
      records.push(JSON.stringify(next.value.properties ?? {}));
    }
    return `${dbfEntry.entryName}: ${records.join(' | ')}`;
  } catch {
    return null;
  }
}

async function readEntryPreview(
  entry: AdmZip.IZipEntry,
  allEntries: readonly AdmZip.IZipEntry[],
): Promise<string | null> {
  const extension = entryExtension(entry.entryName);
  if (
    extension === '.shp' ||
    extension === '.shx' ||
    extension === '.prj' ||
    extension === '.cpg'
  ) {
    return null;
  }
  const data = entry.getData();
  if (data.length === 0 || data.length > MAX_ENTRY_BYTES) return null;
  if (TEXT_EXTENSIONS.has(extension)) {
    return `${entry.entryName}: ${readTextEntry(data)}`;
  }
  if (extension === '.xlsx') {
    return readXlsxPreview(data, entry.entryName);
  }
  if (extension === '.dbf') {
    return await readDbfPreview(allEntries, entry);
  }
  if (extension === '.pdf') {
    const { text } = await pdfToText(data);
    return `${entry.entryName}: ${text.trim()}`;
  }
  if (extension === '.geojson' || isPcgGeoJsonName(entry.entryName)) {
    const raw = data.toString('utf8').trim().slice(0, GEOJSON_PREVIEW_CHARS);
    return `${entry.entryName}: ${raw}`;
  }
  return null;
}

/**
 * Inspects a ZIP archive and builds a truncated text preview for pre-classification.
 * Veneto PCG ZIPs get a deterministic PIANO_COLTURALE category; all other archives
 * rely on the extracted preview for LLM and VAT matching.
 */
export async function inspectZipForPreclassification(
  buffer: Buffer,
  fileName: string,
): Promise<ZipPreclassifyContext> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return fallbackContext(fileName, []);
  }
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const entryNames = entries.map((entry) => entry.entryName);
  if (isVenetoPcgZip(buffer)) {
    return venetoPcgContext(fileName, entryNames);
  }
  const parts = [`fileName: ${fileName}`, `entries: ${entryNames.join(', ')}`];
  const detection = detectZipType(buffer);
  parts.push(`zipSignal: ${detection.reason}`);
  let decompressedBytes = 0;
  let processedEntries = 0;
  for (const entry of sortEntriesForPreview(entries)) {
    if (processedEntries >= MAX_TEXT_ENTRIES) break;
    const size = entry.header.size;
    if (size > MAX_ENTRY_BYTES) continue;
    decompressedBytes += size;
    if (decompressedBytes > MAX_TOTAL_DECOMPRESSED_BYTES) break;
    const preview = await readEntryPreview(entry, entries);
    if (!preview) continue;
    parts.push(preview);
    processedEntries += 1;
  }
  return {
    textPreview: truncate(parts.join('\n')),
    deterministicCategory: null,
    categoryConfidence: 0,
    categoryReason: '',
  };
}
