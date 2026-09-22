import { promises as fs } from 'fs';
import { parse } from 'csv-parse/sync';
import {
  CropRequirementWeek,
  NUTRIENT_KEYS,
  NutrientKey,
} from '../../../domain/entities/fertilizer-plan/types';
import { normalizeHeader } from '../../../domain/entities/fertilizer-plan/header-normalizer';
import { resolveCropRequirementFile, ResolvedCropFile } from './filename-resolver';

interface DailyRow {
  readonly daysAfterSowing: number;
  readonly week: number;
  readonly nutrients: Readonly<Record<NutrientKey, number>>;
}

const requirementsCache = new Map<string, readonly CropRequirementWeek[]>();

/**
 * Loads weekly crop nutrient requirements from the dataset.
 * Aggregates the per-day rows in the source CSV into per-week rows by summing
 * each nutrient column. The output is cached per absolute file path so repeated
 * lookups are O(1).
 *
 * Privacy: this function MUST be called only from the application layer.
 * Its return value is private and must never be propagated to the agent layer.
 */
export async function loadCropRequirements(cropName: string): Promise<{
  readonly weeks: readonly CropRequirementWeek[];
  readonly resolved: ResolvedCropFile;
}> {
  const resolved = await resolveCropRequirementFile(cropName);
  const cached = requirementsCache.get(resolved.absolutePath);
  if (cached) return { weeks: cached, resolved };
  const weeks = await parseRequirementCsv(resolved.absolutePath);
  requirementsCache.set(resolved.absolutePath, weeks);
  return { weeks, resolved };
}

async function parseRequirementCsv(absolutePath: string): Promise<readonly CropRequirementWeek[]> {
  const raw = await fs.readFile(absolutePath, 'utf-8');
  const rows = parse(raw, {
    delimiter: ';',
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];
  if (rows.length < 2) return [];
  const headers = rows[0];
  const nutrientCols = mapNutrientColumns(headers);
  const dayCol = headers.findIndex((h) => /giorni|dia|day/i.test(stripDiacritics(h)));
  const weekCol = headers.findIndex((h) => /settimana|semana|week/i.test(stripDiacritics(h)));
  const dailyRows: DailyRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length === 0) continue;
    dailyRows.push(parseDailyRow(row, dayCol, weekCol, nutrientCols));
  }
  return aggregateByWeek(dailyRows);
}

function mapNutrientColumns(headers: readonly string[]): ReadonlyMap<NutrientKey, number> {
  const map = new Map<NutrientKey, number>();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function parseDailyRow(
  row: readonly string[],
  dayCol: number,
  weekCol: number,
  nutrientCols: ReadonlyMap<NutrientKey, number>,
): DailyRow {
  const nutrients = NUTRIENT_KEYS.reduce(
    (acc, key) => {
      const colIndex = nutrientCols.get(key);
      const raw = colIndex !== undefined ? parseEuFloat(row[colIndex]) : 0;
      acc[key] = key === 'B' ? raw / GRAMS_PER_KILOGRAM : raw;
      return acc;
    },
    {} as Record<NutrientKey, number>,
  );
  return {
    daysAfterSowing: parseEuFloat(row[dayCol] ?? '0'),
    week: parseEuFloat(row[weekCol] ?? '0'),
    nutrients,
  };
}

/**
 * Boron columns in the dataset are expressed in grams/ha (header "B Grammi/Ha"
 * / "B Gram/Ha" / "B Gramos/Ha"). All other macro-nutrients are kg/ha. We
 * convert B to kg/ha at parse time so the optimizer can treat every nutrient
 * with the same unit (kg/ha) and the same fertilizer-content semantics (% mass).
 */
const GRAMS_PER_KILOGRAM = 1000;

function aggregateByWeek(rows: readonly DailyRow[]): readonly CropRequirementWeek[] {
  const grouped = new Map<number, { firstDay: number; nutrients: Record<NutrientKey, number> }>();
  for (const row of rows) {
    const bucket = grouped.get(row.week);
    if (!bucket) {
      grouped.set(row.week, {
        firstDay: row.daysAfterSowing,
        nutrients: { ...row.nutrients },
      });
      continue;
    }
    bucket.firstDay = Math.min(bucket.firstDay, row.daysAfterSowing);
    for (const key of NUTRIENT_KEYS) bucket.nutrients[key] += row.nutrients[key];
  }
  return [...grouped.entries()]
    .sort(([weekA], [weekB]) => weekA - weekB)
    .map(([week, value]) => ({
      week,
      daysAfterSowing: value.firstDay,
      N: value.nutrients.N,
      P2O5: value.nutrients.P2O5,
      K2O: value.nutrients.K2O,
      MgO: value.nutrients.MgO,
      CaO: value.nutrients.CaO,
      B: value.nutrients.B,
    }));
}

function parseEuFloat(value: string | undefined): number {
  if (value === undefined || value === null) return 0;
  const parsed = parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function clearCropRequirementsCache(): void {
  requirementsCache.clear();
}
