/**
 * Reports which crops are missing a dedicated requirement CSV in
 * `dataset/fertilizer_plan/crop_req/`. The optimizer falls back to
 * `generico.csv` for any unmatched crop, so this report flags the cases where
 * the fallback would actually kick in.
 *
 * Sources of truth for the master crop list:
 *   1. Headers of dataset/fertilizer_plan/yield_crop.csv (canonical seed list).
 *   2. DISTINCT cropName from ProductionCycle (crops actually used in the system).
 *
 * Usage:
 *   npx tsx scripts/check-fertilizer-coverage.ts            # stdout only
 *   npx tsx scripts/check-fertilizer-coverage.ts --out FILE # also writes to FILE
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';

dotenv.config();

import { prisma } from '../src/infrastructure/repositories/Prisma';
import { normalizeCropName } from '../src/infrastructure/services/fertilizer/filename-resolver';

const ROOT = process.cwd();
const CROP_REQ_DIR = path.join(ROOT, 'dataset', 'fertilizer_plan', 'crop_req');
const YIELD_CSV = path.join(ROOT, 'dataset', 'fertilizer_plan', 'yield_crop.csv');

interface Row {
  readonly crop: string;
  readonly inYield: boolean;
  readonly hasReqFile: boolean;
  readonly dbCount: number;
}

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null;
  const yieldCrops = await readYieldHeaders();
  const reqFiles = await readReqFilenames();
  const dbCrops = await countDbCrops();
  const allCrops = mergeCropKeys(yieldCrops, reqFiles, dbCrops);
  const rows = allCrops
    .map((crop) => buildRow(crop, yieldCrops, reqFiles, dbCrops))
    .sort((a, b) => a.crop.localeCompare(b.crop));
  const markdown = renderMarkdown(rows);
  process.stdout.write(`${markdown}\n`);
  if (outPath) {
    await fs.writeFile(path.resolve(outPath), markdown);
    process.stdout.write(`\nWritten to ${outPath}\n`);
  }
  await prisma.$disconnect();
}

async function readYieldHeaders(): Promise<ReadonlySet<string>> {
  const raw = await fs.readFile(YIELD_CSV, 'utf-8');
  const rows = parse(raw, { delimiter: ';', trim: true, skip_empty_lines: true }) as string[][];
  if (rows.length === 0) return new Set();
  return new Set(rows[0].map((h) => normalizeCropName(h)));
}

async function readReqFilenames(): Promise<ReadonlySet<string>> {
  const files = await fs.readdir(CROP_REQ_DIR);
  const set = new Set<string>();
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.csv')) continue;
    if (file === 'generico.csv') continue;
    const baseName = file.replace(/\.csv$/i, '');
    set.add(normalizeCropName(baseName));
  }
  return set;
}

async function countDbCrops(): Promise<ReadonlyMap<string, number>> {
  const rows = await prisma.productionCycle.groupBy({
    by: ['cropName'],
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeCropName(row.cropName);
    map.set(key, (map.get(key) ?? 0) + row._count._all);
  }
  return map;
}

function mergeCropKeys(
  yieldCrops: ReadonlySet<string>,
  reqFiles: ReadonlySet<string>,
  dbCrops: ReadonlyMap<string, number>,
): readonly string[] {
  const merged = new Set<string>();
  for (const c of yieldCrops) merged.add(c);
  for (const c of reqFiles) merged.add(c);
  for (const c of dbCrops.keys()) merged.add(c);
  return [...merged];
}

function buildRow(
  crop: string,
  yieldCrops: ReadonlySet<string>,
  reqFiles: ReadonlySet<string>,
  dbCrops: ReadonlyMap<string, number>,
): Row {
  return {
    crop,
    inYield: yieldCrops.has(crop),
    hasReqFile: reqFiles.has(crop),
    dbCount: dbCrops.get(crop) ?? 0,
  };
}

function renderMarkdown(rows: readonly Row[]): string {
  const missing = rows.filter((r) => !r.hasReqFile);
  const header =
    '# Fertilizer plan: crop coverage report\n\n' +
    `Generated: ${new Date().toISOString()}\n\n` +
    `Total crops scanned: ${rows.length}\n` +
    `Crops missing a dedicated requirement CSV (will use generic fallback): ${missing.length}\n\n`;
  const tableHeader =
    '| Crop | In yield_crop.csv | In crop_req/ | DB cycles |\n| --- | :---: | :---: | ---: |\n';
  const lines = rows.map((r) => {
    const flag = r.hasReqFile ? '✅' : '❌';
    const yieldFlag = r.inYield ? '✅' : '—';
    return `| ${r.crop} | ${yieldFlag} | ${flag} | ${r.dbCount} |`;
  });
  return `${header}${tableHeader}${lines.join('\n')}\n`;
}

main().catch((error) => {
  console.error(error);
  prisma.$disconnect().finally(() => process.exit(1));
});
