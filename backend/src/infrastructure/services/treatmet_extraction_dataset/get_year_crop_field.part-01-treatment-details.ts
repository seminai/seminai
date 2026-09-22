import path from 'path';
import { cleanProductName } from './get_year_crop_field.part-02-get-year-crop-fields';

// Removed: BulkExtractItemResult not used in this module

export interface TreatmentDetails {
  readonly product: string;
  readonly productComposition: string;
  readonly isOrganic: boolean;
  readonly adversity: string;
  readonly distributionDate: string; // DD/MM/YYYY
  readonly harvestUsefulDate?: string; // DD/MM/YYYY
  readonly totalQuantity: string; // as-is from CSV
  readonly quantityUnit: string; // as-is from CSV (e.g., lt, kg)
  readonly quantityPerHa?: string;
  readonly quantityShared?: string;
  readonly waterVolumeUsed?: string;
  readonly waterShared?: string;
  readonly waterPerHa?: string;
  readonly safetyInterval?: string;
  readonly reEntryTime?: string;
  readonly climateCondition?: string;
  readonly note?: string;
  readonly equipment?: string;
  readonly equipmentId?: string;
  readonly localizedTreatment?: string;
  readonly raw: Readonly<Record<string, string>>;
}

export interface CompanyField {
  readonly name: string; // APPEZZAMENTO
  readonly crop: string; // COLTURA
  readonly variety: string; // VARIETA
  readonly treatments: readonly TreatmentDetails[];
}

export interface CompanyFields {
  readonly company: string; // AZIENDA
  readonly fields: readonly CompanyField[];
}

export type HeaderToIndex = Readonly<Record<string, number>>;

export const DEFAULT_DATASET_RELATIVE_PATH: string = path.join(
  'dataset',
  'dataset_trattamenti',
  'Storico Dati 2024-2025 - Trattamenti fitosanitari.csv',
);

export const DEFAULT_FTS_CSV_RELATIVE_PATH: string = path.join(
  'dataset',
  'fitosanitari',
  'fts_06062025.csv',
);

export const DEFAULT_FTS_JSON_RELATIVE_PATH: string = path.join(
  'dataset',
  'fitosanitari',
  'fts_06062025.json',
);

export const CSV_SPLIT_REGEX: RegExp = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;

export function buildHeaderIndex(headerLine: string): HeaderToIndex {
  const headers = headerLine
    .replace(/\uFEFF/g, '')
    .split(',')
    .map((h) => h.trim());
  const map: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    map[headers[i]] = i;
  }
  return map;
}

export function getValue(parts: string[], header: HeaderToIndex, key: string): string {
  const idx = header[key];
  if (typeof idx !== 'number') return '';
  const raw = parts[idx] ?? '';
  return raw.replace(/^"|"$/g, '').trim();
}

export function parseCsvRows(csvContent: string): ReadonlyArray<Readonly<Record<string, string>>> {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  const header = buildHeaderIndex(lines[0]);
  const out: Array<Readonly<Record<string, string>>> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim().length === 0) continue;
    const parts = line.split(CSV_SPLIT_REGEX);
    const row: Record<string, string> = {};
    for (const key of Object.keys(header)) {
      row[key] = getValue(parts, header, key);
    }
    out.push(row);
  }
  return out;
}

export function extractYear(dateDDMMYYYY: string): number | null {
  if (!dateDDMMYYYY) return null;
  const parts = dateDDMMYYYY.split('/');
  if (parts.length !== 3) return null;
  const year = Number(parts[2]);
  return Number.isFinite(year) ? year : null;
}

export function toBoolean(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'si' || lower === 'sì';
}

export function buildTreatment(row: Readonly<Record<string, string>>): TreatmentDetails {
  return {
    product: row['PRODOTTO'] ?? '',
    productComposition: row['COMPOSIZIONE'] ?? '',
    isOrganic: toBoolean(row['BIO'] ?? ''),
    adversity: row['AVVERSITA'] ?? '',
    distributionDate: row['DATA_INTERVENTO'] ?? '',
    harvestUsefulDate: row['DATA_UTILE_RACCOLTA_IS'] ?? '',
    totalQuantity: row['QTA_TOT'] ?? '',
    quantityUnit: row['UDM'] ?? '',
    quantityPerHa: row['QTA_HA'] ?? '',
    quantityShared: row['QTA_RIPARTITA'] ?? '',
    waterVolumeUsed: row['VOLUME_D_ACQUA_IMPIEGATO'] ?? '',
    waterShared: row['ACQUA_HL_RIPARTITA'] ?? '',
    waterPerHa: row['ACQUA_HA'] ?? '',
    safetyInterval: row['INT_SIC'] ?? '',
    reEntryTime: row['TEMPO_RIENTRO'] ?? '',
    climateCondition: row['CONDIZIONE_CLIMATICA'] ?? '',
    note: row['NOTA'] ?? '',
    equipment: row['ATTREZZATURE'] ?? '',
    equipmentId: row['ATTREZZATURE_ID'] ?? '',
    localizedTreatment: row['TRATTAMENTO_LOCALIZZATO'] ?? '',
    raw: row,
  };
}

export function getDatasetPath(csvFilePath?: string): string {
  if (csvFilePath && csvFilePath.trim().length > 0) return csvFilePath;
  return path.resolve(process.cwd(), DEFAULT_DATASET_RELATIVE_PATH);
}

export function getFtsCsvPath(csvFilePath?: string): string {
  if (csvFilePath && csvFilePath.trim().length > 0) return csvFilePath;
  return path.resolve(process.cwd(), DEFAULT_FTS_CSV_RELATIVE_PATH);
}

export function getFtsJsonPath(jsonFilePath?: string): string {
  if (jsonFilePath && jsonFilePath.trim().length > 0) return jsonFilePath;
  return path.resolve(process.cwd(), DEFAULT_FTS_JSON_RELATIVE_PATH);
}

export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeProductName(value: string): string {
  const cleaned = cleanProductName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripDiacritics(cleaned);
}

export function buildFtsNameToRegIndexFromCsv(ftsCsvContent: string): ReadonlyMap<string, string> {
  const lines = ftsCsvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return new Map<string, string>();
  const header = buildHeaderIndex(lines[0]);
  const nameIdx = header['denominazione_prodotto'];
  const regIdx = header['num_registrazione'];
  if (typeof nameIdx !== 'number' || typeof regIdx !== 'number') return new Map();
  const map = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(CSV_SPLIT_REGEX);
    const name = (parts[nameIdx] ?? '').replace(/^"|"$/g, '').trim();
    const reg = (parts[regIdx] ?? '').replace(/^"|"$/g, '').trim();
    if (!name) continue;
    const key = normalizeProductName(name);
    if (key && reg && !map.has(key)) {
      map.set(key, reg);
    }
  }
  return map;
}

export function buildFtsNameToRegIndexFromJson(jsonContent: string): ReadonlyMap<string, string> {
  try {
    const arr = JSON.parse(jsonContent) as ReadonlyArray<Record<string, unknown>>;
    const map = new Map<string, string>();
    for (const item of arr) {
      const name = String(item['denominazione_prodotto'] ?? '').trim();
      const reg = String(item['num_registrazione'] ?? '').trim();
      if (!name || !reg) continue;
      const key = normalizeProductName(name);
      if (key && !map.has(key)) {
        map.set(key, reg);
      }
    }
    return map;
  } catch (_err) {
    return new Map<string, string>();
  }
}

export function tokenizeName(normalized: string): string[] {
  return normalized.split(' ').filter((t) => t.length >= 2);
}

export function findRegNumberForName(name: string, index: ReadonlyMap<string, string>): string {
  const key = normalizeProductName(name);
  const direct = index.get(key);
  if (direct) return direct;

  const tokens = tokenizeName(key);
  if (tokens.length === 0) return '';

  let bestReg = '';
  let bestScore = 0;
  for (const [k, reg] of index.entries()) {
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (k.includes(t)) {
        score += 1;
      } else {
        ok = false;
        break;
      }
    }
    if (ok && score > bestScore) {
      bestScore = score;
      bestReg = reg;
    }
  }
  return bestReg;
}

/**
 * Build a company->fields summary for a specific year using the dataset format provided.
 * Rows are filtered by DATA_INTERVENTO year and grouped by AZIENDA and (APPEZZAMENTO+COLTURA+VARIETA).
 *
 * @param year Target year (e.g., 2024)
 * @param csvFilePath Optional absolute/relative path to the CSV; defaults to data/dataset_trattamenti/... in repo
 * @returns Array of companies with their fields and related treatments in the given year
 */
export type YearCropFieldsResponse = ReadonlyArray<CompanyFields>;
