import { promises as fs } from 'fs';
import * as path from 'path';

const CROP_REQ_DIR = path.resolve(process.cwd(), 'dataset', 'fertilizer_plan', 'crop_req');
const GENERIC_FILENAME = 'generico.csv';

let filenameCache: ReadonlyMap<string, string> | null = null;

export interface ResolvedCropFile {
  readonly filename: string;
  readonly absolutePath: string;
  readonly usedGenericFallback: boolean;
}

/**
 * Maps a free-text cropName to the closest matching CSV in dataset/fertilizer_plan/crop_req/.
 * Falls back to generico.csv when no match is found.
 *
 * Match strategy: case-insensitive comparison after normalizing both sides
 * (lowercase, every non-alphanumeric run collapsed to a single '+', leading/trailing '+' trimmed).
 * This handles user input variants like "Banana & Plantain", "banana_plantain",
 * "BANANA-PLANTAIN" — they all normalize to "banana+plantain".
 */
export async function resolveCropRequirementFile(cropName: string): Promise<ResolvedCropFile> {
  const cache = await loadFilenameCache();
  const normalized = normalizeCropName(cropName);
  const match = cache.get(normalized);
  if (match) {
    return {
      filename: match,
      absolutePath: path.join(CROP_REQ_DIR, match),
      usedGenericFallback: false,
    };
  }
  return {
    filename: GENERIC_FILENAME,
    absolutePath: path.join(CROP_REQ_DIR, GENERIC_FILENAME),
    usedGenericFallback: true,
  };
}

/**
 * Normalizes a crop name for matching against CSV filenames.
 * Lowercases, then collapses every run of non-alphanumeric characters into a
 * single '+' separator. Strips any leading/trailing '+'. Strips diacritics so
 * 'pomodorò' matches 'pomodoro'.
 */
export function normalizeCropName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '+')
    .replace(/^\+|\+$/g, '');
}

async function loadFilenameCache(): Promise<ReadonlyMap<string, string>> {
  if (filenameCache) return filenameCache;
  const files = await fs.readdir(CROP_REQ_DIR);
  const map = new Map<string, string>();
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.csv')) continue;
    if (file === GENERIC_FILENAME) continue;
    const baseName = file.replace(/\.csv$/i, '');
    const cropKey = normalizeCropName(baseName);
    map.set(cropKey, file);
  }
  filenameCache = map;
  return map;
}
