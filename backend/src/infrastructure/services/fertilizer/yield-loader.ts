import { promises as fs } from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { normalizeCropName } from './filename-resolver';

const YIELD_CSV_PATH = path.resolve(process.cwd(), 'dataset', 'fertilizer_plan', 'yield_crop.csv');
const DEFAULT_YIELD = 1;

let yieldCache: ReadonlyMap<string, number> | null = null;

/**
 * Returns the default yield (in tons/ha) for the given crop, or 1 when not found.
 *
 * Privacy: yield numbers are private; this function must be called only from
 * the application layer (use case). Never propagate the value to the agent.
 */
export async function getDefaultYield(cropName: string): Promise<number> {
  const cache = await loadYieldCache();
  return cache.get(normalizeCropName(cropName)) ?? DEFAULT_YIELD;
}

async function loadYieldCache(): Promise<ReadonlyMap<string, number>> {
  if (yieldCache) return yieldCache;
  const raw = await fs.readFile(YIELD_CSV_PATH, 'utf-8');
  const rows = parse(raw, { delimiter: ';', trim: true, skip_empty_lines: true }) as string[][];
  if (rows.length < 2) {
    yieldCache = new Map();
    return yieldCache;
  }
  const headers = rows[0].map((h) => normalizeCropName(h));
  const firstDataRow = rows[1];
  const map = new Map<string, number>();
  headers.forEach((cropKey, index) => {
    const value = parseYieldFloat(firstDataRow[index]);
    if (value > 0) map.set(cropKey, value);
  });
  yieldCache = map;
  return map;
}

function parseYieldFloat(value: string | undefined): number {
  if (value === undefined || value === null) return 0;
  // yield_crop.csv uses "." as decimal separator (unlike crop_req CSVs which use ",").
  const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clearYieldCache(): void {
  yieldCache = null;
}
