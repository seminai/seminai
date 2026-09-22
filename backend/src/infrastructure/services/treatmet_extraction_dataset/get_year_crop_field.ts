import fs from 'fs';
import path from 'path';
// Removed: BulkExtractItemResult not used in this module

interface TreatmentDetails {
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

interface CompanyField {
  readonly name: string; // APPEZZAMENTO
  readonly crop: string; // COLTURA
  readonly variety: string; // VARIETA
  readonly treatments: readonly TreatmentDetails[];
}

interface CompanyFields {
  readonly company: string; // AZIENDA
  readonly fields: readonly CompanyField[];
}

type HeaderToIndex = Readonly<Record<string, number>>;

const DEFAULT_DATASET_RELATIVE_PATH: string = path.join(
  'dataset',
  'dataset_trattamenti',
  'Storico Dati 2024-2025 - Trattamenti fitosanitari.csv',
);

const DEFAULT_FTS_CSV_RELATIVE_PATH: string = path.join(
  'dataset',
  'fitosanitari',
  'fts_06062025.csv',
);
const DEFAULT_FTS_JSON_RELATIVE_PATH: string = path.join(
  'dataset',
  'fitosanitari',
  'fts_06062025.json',
);

const CSV_SPLIT_REGEX: RegExp = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;

function buildHeaderIndex(headerLine: string): HeaderToIndex {
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

function getValue(parts: string[], header: HeaderToIndex, key: string): string {
  const idx = header[key];
  if (typeof idx !== 'number') return '';
  const raw = parts[idx] ?? '';
  return raw.replace(/^"|"$/g, '').trim();
}

function parseCsvRows(csvContent: string): ReadonlyArray<Readonly<Record<string, string>>> {
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

function extractYear(dateDDMMYYYY: string): number | null {
  if (!dateDDMMYYYY) return null;
  const parts = dateDDMMYYYY.split('/');
  if (parts.length !== 3) return null;
  const year = Number(parts[2]);
  return Number.isFinite(year) ? year : null;
}

function toBoolean(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'si' || lower === 'sì';
}

function buildTreatment(row: Readonly<Record<string, string>>): TreatmentDetails {
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

function getDatasetPath(csvFilePath?: string): string {
  if (csvFilePath && csvFilePath.trim().length > 0) return csvFilePath;
  return path.resolve(process.cwd(), DEFAULT_DATASET_RELATIVE_PATH);
}

function getFtsCsvPath(csvFilePath?: string): string {
  if (csvFilePath && csvFilePath.trim().length > 0) return csvFilePath;
  return path.resolve(process.cwd(), DEFAULT_FTS_CSV_RELATIVE_PATH);
}

function getFtsJsonPath(jsonFilePath?: string): string {
  if (jsonFilePath && jsonFilePath.trim().length > 0) return jsonFilePath;
  return path.resolve(process.cwd(), DEFAULT_FTS_JSON_RELATIVE_PATH);
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeProductName(value: string): string {
  const cleaned = cleanProductName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripDiacritics(cleaned);
}

function buildFtsNameToRegIndexFromCsv(ftsCsvContent: string): ReadonlyMap<string, string> {
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

function buildFtsNameToRegIndexFromJson(jsonContent: string): ReadonlyMap<string, string> {
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

function tokenizeName(normalized: string): string[] {
  return normalized.split(' ').filter((t) => t.length >= 2);
}

function findRegNumberForName(name: string, index: ReadonlyMap<string, string>): string {
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
type YearCropFieldsResponse = ReadonlyArray<CompanyFields>;

export async function getYearCropFields(
  year: number,
  csvFilePath?: string,
  filters?: {
    readonly name?: string;
    readonly crop?: string;
    readonly variety?: string;
  },
): Promise<YearCropFieldsResponse> {
  const datasetPath = getDatasetPath(csvFilePath);
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`CSV dataset not found at: ${datasetPath}`);
  }

  const csvContent = fs.readFileSync(datasetPath, { encoding: 'utf-8' });
  const rows = parseCsvRows(csvContent);

  const needle = {
    name: (filters?.name || '').trim().toLowerCase(),
    crop: (filters?.crop || '').trim().toLowerCase(),
    variety: (filters?.variety || '').trim().toLowerCase(),
  } as const;

  const filtered = rows.filter((r) => {
    if (extractYear(r['DATA_INTERVENTO'] ?? '') !== year) return false;
    const fieldName = (r['APPEZZAMENTO'] ?? '').trim().toLowerCase();
    const crop = (r['COLTURA'] ?? '').trim().toLowerCase();
    const variety = (r['VARIETA'] ?? '').trim().toLowerCase();
    if (needle.name && !fieldName.includes(needle.name)) return false;
    if (needle.crop && !crop.includes(needle.crop)) return false;
    if (needle.variety && !variety.includes(needle.variety)) return false;
    return true;
  });

  type FieldKey = string; // `${appezzamento}||${crop}||${variety}`
  const companyToFields: Map<string, Map<FieldKey, CompanyField>> = new Map();

  for (const row of filtered) {
    const company = (row['AZIENDA'] ?? '').trim();
    const fieldName = (row['APPEZZAMENTO'] ?? '').trim();
    const crop = (row['COLTURA'] ?? '').trim();
    const variety = (row['VARIETA'] ?? '').trim();
    if (!company || !fieldName || !crop) continue;

    const fieldKey: FieldKey = `${fieldName}||${crop}||${variety}`;
    const treatment = buildTreatment(row);

    if (!companyToFields.has(company)) {
      companyToFields.set(company, new Map<FieldKey, CompanyField>());
    }
    const fieldsMap = companyToFields.get(company)!;

    if (!fieldsMap.has(fieldKey)) {
      fieldsMap.set(fieldKey, {
        name: fieldName,
        crop,
        variety,
        treatments: [treatment],
      });
    } else {
      const existing = fieldsMap.get(fieldKey)!;
      fieldsMap.set(fieldKey, {
        ...existing,
        treatments: [...existing.treatments, treatment],
      });
    }
  }

  const result: CompanyFields[] = [];
  for (const [company, fieldsMap] of companyToFields.entries()) {
    const fieldsArray = Array.from(fieldsMap.values()).map((f) => ({
      name: f.name,
      crop: f.crop,
      variety: f.variety,
      treatments: f.treatments,
    }));
    fieldsArray.sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      const byCrop = a.crop.localeCompare(b.crop);
      if (byCrop !== 0) return byCrop;
      return a.variety.localeCompare(b.variety);
    });
    result.push({ company, fields: fieldsArray });
  }

  // Sort for deterministic output
  result.sort((a, b) => a.company.localeCompare(b.company));

  return result as YearCropFieldsResponse;
}

interface TreatmentSummaryItem {
  readonly name: string; // lowercased, cleaned product name
  readonly quantity: string; // total quantity across rows (formatted with comma decimals)
  readonly udm: string; // unit of measure from CSV (UDM)
}

interface CompanyFieldSummary {
  readonly name: string;
  readonly crop: string;
  readonly variety: string;
  readonly treatments: readonly TreatmentSummaryItem[];
}

interface CompanyFieldsSummary {
  readonly company: string;
  readonly fields: readonly CompanyFieldSummary[];
}

type YearCropFieldsSummaryResponse = ReadonlyArray<CompanyFieldsSummary>;

function parseItalianNumber(input: string): number {
  if (!input) return 0;
  const sanitized = input
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .replace(/"/g, '')
    .replace(',', '.');
  const num = Number(sanitized);
  return Number.isFinite(num) ? num : 0;
}

function formatItalianNumber(value: number): string {
  const fixed = value.toFixed(6);
  const trimmed = fixed.replace(/0+$/g, '').replace(/\.$/, '');
  return trimmed.replace('.', ',');
}

function cleanProductName(rawName: string): string {
  const trimmed = (rawName || '').trim();
  const withoutReg = trimmed.replace(/\s*\(reg\.\s*n\.[^)]+\)/i, '');
  return withoutReg.toLowerCase();
}

export async function getYearCropFieldsSummary(
  year: number,
  csvFilePath?: string,
  filters?: {
    readonly name?: string; // filter by APPEZZAMENTO contains (case-insensitive)
    readonly crop?: string; // filter by COLTURA contains (case-insensitive)
    readonly variety?: string; // filter by VARIETA contains (case-insensitive)
  },
): Promise<YearCropFieldsSummaryResponse> {
  const datasetPath = getDatasetPath(csvFilePath);
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`CSV dataset not found at: ${datasetPath}`);
  }

  const csvContent = fs.readFileSync(datasetPath, { encoding: 'utf-8' });
  const rows = parseCsvRows(csvContent);
  const needle = {
    name: (filters?.name || '').trim().toLowerCase(),
    crop: (filters?.crop || '').trim().toLowerCase(),
    variety: (filters?.variety || '').trim().toLowerCase(),
  } as const;

  const filtered = rows.filter((r) => {
    if (extractYear(r['DATA_INTERVENTO'] ?? '') !== year) return false;
    const fieldName = (r['APPEZZAMENTO'] ?? '').trim().toLowerCase();
    const crop = (r['COLTURA'] ?? '').trim().toLowerCase();
    const variety = (r['VARIETA'] ?? '').trim().toLowerCase();
    if (needle.name && !fieldName.includes(needle.name)) return false;
    if (needle.crop && !crop.includes(needle.crop)) return false;
    if (needle.variety && !variety.includes(needle.variety)) return false;
    return true;
  });

  type FieldKey = string; // `${appezzamento}||${crop}||${variety}`
  const companyToFields: Map<
    string,
    Map<
      FieldKey,
      {
        name: string;
        crop: string;
        variety: string;
        totals: Map<string, { total: number; unit: string }>;
      }
    >
  > = new Map();

  for (const row of filtered) {
    const company = (row['AZIENDA'] ?? '').trim();
    const fieldName = (row['APPEZZAMENTO'] ?? '').trim();
    const crop = (row['COLTURA'] ?? '').trim();
    const variety = (row['VARIETA'] ?? '').trim();
    const product = (row['PRODOTTO'] ?? '').trim();
    const qtyStr = (row['QTA_TOT'] ?? '').trim();
    const unit = (row['UDM'] ?? '').trim();
    if (!company || !fieldName || !crop || !product) continue;

    const fieldKey: FieldKey = `${fieldName}||${crop}||${variety}`;
    const productKey = cleanProductName(product);
    const qty = parseItalianNumber(qtyStr);

    if (!companyToFields.has(company)) {
      companyToFields.set(company, new Map());
    }
    const fieldsMap = companyToFields.get(company)!;
    if (!fieldsMap.has(fieldKey)) {
      fieldsMap.set(fieldKey, { name: fieldName, crop, variety, totals: new Map() });
    }
    const field = fieldsMap.get(fieldKey)!;
    const prev = field.totals.get(productKey);
    if (!prev) {
      field.totals.set(productKey, { total: qty, unit });
    } else {
      prev.total += qty;
      if (!prev.unit && unit) prev.unit = unit;
      field.totals.set(productKey, prev);
    }
  }

  const result: CompanyFieldsSummary[] = [];
  for (const [company, fieldsMap] of companyToFields.entries()) {
    const fieldsArray: CompanyFieldSummary[] = [];
    for (const [, f] of fieldsMap.entries()) {
      const items: TreatmentSummaryItem[] = Array.from(f.totals.entries())
        .map(([name, agg]) => ({
          name,
          quantity: formatItalianNumber(agg.total),
          udm: agg.unit || '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      fieldsArray.push({ name: f.name, crop: f.crop, variety: f.variety, treatments: items });
    }
    fieldsArray.sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      const byCrop = a.crop.localeCompare(b.crop);
      if (byCrop !== 0) return byCrop;
      return a.variety.localeCompare(b.variety);
    });
    result.push({ company, fields: fieldsArray });
  }

  result.sort((a, b) => a.company.localeCompare(b.company));
  return result as YearCropFieldsSummaryResponse;
}

interface CompanyFieldLight {
  readonly name: string;
  readonly crop: string;
  readonly variety: string;
  readonly surfaceHa?: string;
}

interface CompanyOverviewTreatment {
  readonly name: string;
  readonly regNumber: string;
  readonly quantity: string;
  readonly udm: string;
}

interface CompanyOverviewItem {
  readonly company: string;
  readonly fields: readonly CompanyFieldLight[];
  readonly treatments: readonly CompanyOverviewTreatment[];
}

type YearCompanyOverviewResponse = ReadonlyArray<CompanyOverviewItem>;

export async function getYearCompanyOverview(
  year: number,
  csvFilePath?: string,
  filters?: {
    readonly name?: string; // filter by APPEZZAMENTO contains (case-insensitive)
    readonly crop?: string; // filter by COLTURA contains (case-insensitive)
    readonly variety?: string; // filter by VARIETA contains (case-insensitive)
  },
): Promise<YearCompanyOverviewResponse> {
  const datasetPath = getDatasetPath(csvFilePath);
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`CSV dataset not found at: ${datasetPath}`);
  }

  const csvContent = fs.readFileSync(datasetPath, { encoding: 'utf-8' });
  const rows = parseCsvRows(csvContent);
  let ftsIndex: ReadonlyMap<string, string> = new Map();
  const ftsJsonPath = getFtsJsonPath();
  if (fs.existsSync(ftsJsonPath)) {
    const ftsJsonContent = fs.readFileSync(ftsJsonPath, { encoding: 'utf-8' });
    ftsIndex = buildFtsNameToRegIndexFromJson(ftsJsonContent);
  }
  if (ftsIndex.size === 0) {
    const ftsCsvPath = getFtsCsvPath();
    if (fs.existsSync(ftsCsvPath)) {
      const ftsCsvContent = fs.readFileSync(ftsCsvPath, { encoding: 'utf-8' });
      ftsIndex = buildFtsNameToRegIndexFromCsv(ftsCsvContent);
    }
  }
  const needle = {
    name: (filters?.name || '').trim().toLowerCase(),
    crop: (filters?.crop || '').trim().toLowerCase(),
    variety: (filters?.variety || '').trim().toLowerCase(),
  } as const;

  const filtered = rows.filter((r) => {
    if (extractYear(r['DATA_INTERVENTO'] ?? '') !== year) return false;
    const fieldName = (r['APPEZZAMENTO'] ?? '').trim().toLowerCase();
    const crop = (r['COLTURA'] ?? '').trim().toLowerCase();
    const variety = (r['VARIETA'] ?? '').trim().toLowerCase();
    if (needle.name && !fieldName.includes(needle.name)) return false;
    if (needle.crop && !crop.includes(needle.crop)) return false;
    if (needle.variety && !variety.includes(needle.variety)) return false;
    return true;
  });

  type FieldKey = string; // `${appezzamento}||${crop}||${variety}`
  const companyToData: Map<
    string,
    {
      fields: Map<
        FieldKey,
        {
          name: string;
          crop: string;
          variety: string;
          surfaceHa?: number;
        }
      >;
      totals: Map<string, { total: number; unit: string }>;
    }
  > = new Map();

  for (const row of filtered) {
    const company = (row['AZIENDA'] ?? '').trim();
    if (!company) continue;
    const fieldName = (row['APPEZZAMENTO'] ?? '').trim();
    const crop = (row['COLTURA'] ?? '').trim();
    const variety = (row['VARIETA'] ?? '').trim();
    const product = (row['PRODOTTO'] ?? '').trim();
    const qtyStr = (row['QTA_TOT'] ?? '').trim();
    const unit = (row['UDM'] ?? '').trim();
    const surfaceStr = (row['SUPERFICIE'] ?? '').trim();
    const surfaceNum = parseItalianNumber(surfaceStr);
    if (!fieldName || !crop || !product) continue;

    const productKey = cleanProductName(product);
    const qty = parseItalianNumber(qtyStr);
    const fieldKey: FieldKey = `${fieldName}||${crop}||${variety}`;

    if (!companyToData.has(company)) {
      companyToData.set(company, { fields: new Map(), totals: new Map() });
    }
    const data = companyToData.get(company)!;

    if (!data.fields.has(fieldKey)) {
      data.fields.set(fieldKey, {
        name: fieldName,
        crop,
        variety,
        surfaceHa: Number.isFinite(surfaceNum) && surfaceNum > 0 ? surfaceNum : undefined,
      });
    }
    const storedField = data.fields.get(fieldKey)!;
    if (Number.isFinite(surfaceNum) && surfaceNum > 0) {
      if (storedField.surfaceHa === undefined || surfaceNum > storedField.surfaceHa) {
        data.fields.set(fieldKey, { ...storedField, surfaceHa: surfaceNum });
      }
    }

    const prev = data.totals.get(productKey);
    if (!prev) {
      data.totals.set(productKey, { total: qty, unit });
    } else {
      prev.total += qty;
      if (!prev.unit && unit) prev.unit = unit;
      data.totals.set(productKey, prev);
    }
  }

  const result: CompanyOverviewItem[] = [];
  for (const [company, data] of companyToData.entries()) {
    const fields = Array.from(data.fields.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      const byCrop = a.crop.localeCompare(b.crop);
      if (byCrop !== 0) return byCrop;
      return a.variety.localeCompare(b.variety);
    });
    const treatments = Array.from(data.totals.entries())
      .map(([name, agg]) => ({
        name,
        regNumber: findRegNumberForName(name, ftsIndex) || '',
        quantity: formatItalianNumber(agg.total),
        udm: agg.unit || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const fieldsWithSurface = fields.map((f) => ({
      name: f.name,
      crop: f.crop,
      variety: f.variety,
      surfaceHa: typeof f.surfaceHa === 'number' ? formatItalianNumber(f.surfaceHa) : undefined,
    }));
    result.push({ company, fields: fieldsWithSurface, treatments });
  }

  result.sort((a, b) => a.company.localeCompare(b.company));
  return result as YearCompanyOverviewResponse;
}

/**
 * Build a ground-truth like structure for a specific company and year based on the CSV dataset.
 * The output shape mirrors UnitAllowedProductsOutput: an array of objects where each item maps a
 * unitProductionId (synthetic, derived from field data) to a list of products. Products are
 * represented using BulkExtractItemResult with minimal fields populated from the dataset.
 */
export async function getCompanyGroundTruthByYear(
  year: number,
  companyName: string,
  csvFilePath?: string,
  ftsCsvPath?: string,
  ftsJsonPath?: string,
): Promise<
  ReadonlyArray<{
    readonly idApp?: string;
    readonly name: string;
    readonly codice: string;
    readonly coltura: string;
    readonly varieta: string;
    readonly comune: string;
    readonly provincia: string;
    readonly regione: string;
    readonly superficie?: string;
    readonly bio: boolean;
    readonly products: ReadonlyArray<{
      readonly name: string;
      readonly regNumber: string;
      readonly quantity: string;
      readonly unit: string;
    }>;
  }>
> {
  const datasetPath = getDatasetPath(csvFilePath);
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`CSV dataset not found at: ${datasetPath}`);
  }

  const csvContent = fs.readFileSync(datasetPath, { encoding: 'utf-8' });
  const rows = parseCsvRows(csvContent);
  const companyNeedle = (companyName || '').trim().toLowerCase();
  if (!companyNeedle) {
    throw new Error('Missing company name');
  }

  // Build product name -> regNumber index from FTS dataset (prefer JSON, fallback CSV)
  let ftsIndex: ReadonlyMap<string, string> = new Map();
  const jsonPath = getFtsJsonPath(ftsJsonPath);
  if (fs.existsSync(jsonPath)) {
    const jsonContent = fs.readFileSync(jsonPath, { encoding: 'utf-8' });
    ftsIndex = buildFtsNameToRegIndexFromJson(jsonContent);
  }
  if (ftsIndex.size === 0) {
    const csvPathResolved = getFtsCsvPath(ftsCsvPath);
    if (!fs.existsSync(csvPathResolved)) {
      throw new Error(`FTS dataset not found at: ${jsonPath} or ${csvPathResolved}`);
    }
    const ftsCsvContent = fs.readFileSync(csvPathResolved, { encoding: 'utf-8' });
    ftsIndex = buildFtsNameToRegIndexFromCsv(ftsCsvContent);
  }

  // Group by production unit (APPEZZAMENTO) and aggregate totals per product
  type UnitKey = string;
  const unitMap: Map<
    UnitKey,
    {
      idApp?: string;
      name: string;
      codice: string;
      coltura: string;
      varieta: string;
      comune: string;
      provincia: string;
      regione: string;
      superficie?: number;
      bio: boolean;
      productTotals: Map<string, { total: number; unit: string }>;
    }
  > = new Map();

  for (const row of rows) {
    if (extractYear(row['DATA_INTERVENTO'] ?? '') !== year) continue;
    const company = (row['AZIENDA'] ?? '').trim();
    if (!company || company.toLowerCase() !== companyNeedle) continue;

    const name = (row['APPEZZAMENTO'] ?? '').trim();
    const codice = (row['CODICE'] ?? '').trim();
    const coltura = (row['COLTURA'] ?? '').trim();
    const varieta = (row['VARIETA'] ?? '').trim();
    const comune = (row['COMUNE'] ?? '').trim();
    const provincia = (row['PROVINCIA'] ?? '').trim();
    const regione = (row['REGIONE'] ?? '').trim();
    const superficieStr = (row['SUPERFICIE'] ?? '').trim();
    const superficieNum = parseItalianNumber(superficieStr);
    const bio = toBoolean(row['BIO'] ?? '');

    const product = (row['PRODOTTO'] ?? '').trim();
    const qtyStr = (row['QTA_TOT'] ?? '').trim();
    const unit = (row['UDM'] ?? '').trim();

    if (!name || !coltura || !product) continue;

    // Build unit key (prefer ID_APP if present)
    const idApp = String(row['ID_APP'] ?? '').trim();
    const key: UnitKey = idApp
      ? `ID:${idApp}`
      : `${name}||${coltura}||${varieta}||${comune}||${provincia}||${regione}||${codice}`;

    // Aggregate product quantities
    const productKey = cleanProductName(product);
    const qty = parseItalianNumber(qtyStr);

    let unitData = unitMap.get(key);
    if (!unitData) {
      unitData = {
        idApp: idApp || undefined,
        name,
        codice,
        coltura,
        varieta,
        comune,
        provincia,
        regione,
        superficie: Number.isFinite(superficieNum) && superficieNum > 0 ? superficieNum : undefined,
        bio,
        productTotals: new Map(),
      };
      unitMap.set(key, unitData);
    }

    const prev = unitData.productTotals.get(productKey);
    if (!prev) {
      unitData.productTotals.set(productKey, { total: qty, unit });
    } else {
      prev.total += qty;
      if (!prev.unit && unit) prev.unit = unit;
      unitData.productTotals.set(productKey, prev);
    }

    // Update superficie if we have a better value
    if (
      Number.isFinite(superficieNum) &&
      superficieNum > 0 &&
      (unitData.superficie === undefined || superficieNum > unitData.superficie)
    ) {
      unitData.superficie = superficieNum;
    }
  }

  // Build output array
  const outputs: Array<{
    readonly idApp?: string;
    readonly name: string;
    readonly codice: string;
    readonly coltura: string;
    readonly varieta: string;
    readonly comune: string;
    readonly provincia: string;
    readonly regione: string;
    readonly superficie?: string;
    readonly bio: boolean;
    readonly products: ReadonlyArray<{
      readonly name: string;
      readonly regNumber: string;
      readonly quantity: string;
      readonly unit: string;
    }>;
  }> = [];

  for (const unitData of unitMap.values()) {
    const products = Array.from(unitData.productTotals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, agg]) => {
        const reg = findRegNumberForName(name, ftsIndex) || '';
        return {
          name,
          regNumber: reg,
          quantity: formatItalianNumber(agg.total),
          unit: agg.unit || '',
        };
      });
    outputs.push({
      idApp: unitData.idApp,
      name: unitData.name,
      codice: unitData.codice,
      coltura: unitData.coltura,
      varieta: unitData.varieta,
      comune: unitData.comune,
      provincia: unitData.provincia,
      regione: unitData.regione,
      superficie:
        unitData.superficie !== undefined ? formatItalianNumber(unitData.superficie) : undefined,
      bio: unitData.bio,
      products,
    });
  }

  // Deterministic output order by name and coltura
  outputs.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) return nameCompare;
    return a.coltura.localeCompare(b.coltura);
  });
  return outputs;
}

/**
 * Build an input ground-truth object for a company and year with:
 * - products: all products used within the year, with totals and units
 * - productionUnits: list of production units (fields) with rich metadata
 */
export async function getCompanyInputGroundTruthByYear(
  year: number,
  companyName: string,
  csvFilePath?: string,
  ftsCsvPath?: string,
  ftsJsonPath?: string,
): Promise<
  Readonly<{
    readonly products: ReadonlyArray<{
      readonly name: string;
      readonly regNumber: string;
      readonly quantity: string;
      readonly unit: string;
    }>;
    readonly productionUnits: ReadonlyArray<{
      readonly idApp?: string;
      readonly name: string; // APPEZZAMENTO
      readonly codice: string; // CODICE
      readonly coltura: string; // COLTURA
      readonly varieta: string; // VARIETA
      readonly comune: string; // COMUNE
      readonly provincia: string; // PROVINCIA
      readonly regione: string; // REGIONE
      readonly superficie?: string; // formatted number
      readonly bio: boolean; // BIO
    }>;
  }>
> {
  const datasetPath = getDatasetPath(csvFilePath);
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`CSV dataset not found at: ${datasetPath}`);
  }

  const csvContent = fs.readFileSync(datasetPath, { encoding: 'utf-8' });
  const rows = parseCsvRows(csvContent);
  const companyNeedle = (companyName || '').trim().toLowerCase();
  if (!companyNeedle) {
    throw new Error('Missing company name');
  }

  // Build product name -> regNumber index from FTS dataset (prefer JSON, fallback CSV)
  let ftsIndex: ReadonlyMap<string, string> = new Map();
  const jsonPath = getFtsJsonPath(ftsJsonPath);
  if (fs.existsSync(jsonPath)) {
    const jsonContent = fs.readFileSync(jsonPath, { encoding: 'utf-8' });
    ftsIndex = buildFtsNameToRegIndexFromJson(jsonContent);
  }
  if (ftsIndex.size === 0) {
    const csvPathResolved = getFtsCsvPath(ftsCsvPath);
    if (!fs.existsSync(csvPathResolved)) {
      throw new Error(`FTS dataset not found at: ${jsonPath} or ${csvPathResolved}`);
    }
    const ftsCsvContent = fs.readFileSync(csvPathResolved, { encoding: 'utf-8' });
    ftsIndex = buildFtsNameToRegIndexFromCsv(ftsCsvContent);
  }

  // Aggregate products and production units
  const productTotals: Map<string, { total: number; unit: string }> = new Map();
  type UnitKey = string; // prefer ID_APP if present else composite
  const unitMap: Map<
    UnitKey,
    {
      idApp?: string;
      name: string;
      codice: string;
      coltura: string;
      varieta: string;
      comune: string;
      provincia: string;
      regione: string;
      superficie?: number;
      bio: boolean;
    }
  > = new Map();

  for (const row of rows) {
    if (extractYear(row['DATA_INTERVENTO'] ?? '') !== year) continue;
    const company = (row['AZIENDA'] ?? '').trim();
    if (!company || company.toLowerCase() !== companyNeedle) continue;

    const name = (row['APPEZZAMENTO'] ?? '').trim();
    const codice = (row['CODICE'] ?? '').trim();
    const coltura = (row['COLTURA'] ?? '').trim();
    const varieta = (row['VARIETA'] ?? '').trim();
    const comune = (row['COMUNE'] ?? '').trim();
    const provincia = (row['PROVINCIA'] ?? '').trim();
    const regione = (row['REGIONE'] ?? '').trim();
    const superficieStr = (row['SUPERFICIE'] ?? '').trim();
    const superficieNum = parseItalianNumber(superficieStr);
    const bio = toBoolean(row['BIO'] ?? '');

    const product = (row['PRODOTTO'] ?? '').trim();
    const qtyStr = (row['QTA_TOT'] ?? '').trim();
    const unit = (row['UDM'] ?? '').trim();

    if (!name || !coltura || !product) continue;

    // Aggregate products
    const productKey = cleanProductName(product);
    const qty = parseItalianNumber(qtyStr);
    const prev = productTotals.get(productKey);
    if (!prev) {
      productTotals.set(productKey, { total: qty, unit });
    } else {
      prev.total += qty;
      if (!prev.unit && unit) prev.unit = unit;
      productTotals.set(productKey, prev);
    }

    // Aggregate production units
    const idApp = String(row['ID_APP'] ?? '').trim();
    const key: UnitKey = idApp
      ? `ID:${idApp}`
      : `${name}||${coltura}||${varieta}||${comune}||${provincia}||${regione}||${codice}`;
    const existing = unitMap.get(key);
    if (!existing) {
      unitMap.set(key, {
        idApp: idApp || undefined,
        name,
        codice,
        coltura,
        varieta,
        comune,
        provincia,
        regione,
        superficie: Number.isFinite(superficieNum) && superficieNum > 0 ? superficieNum : undefined,
        bio,
      });
    } else {
      if (
        Number.isFinite(superficieNum) &&
        superficieNum > 0 &&
        (existing.superficie === undefined || superficieNum > existing.superficie)
      ) {
        existing.superficie = superficieNum;
        unitMap.set(key, existing);
      }
    }
  }

  const products = Array.from(productTotals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, agg]) => ({
      name,
      regNumber: findRegNumberForName(name, ftsIndex) || '',
      quantity: formatItalianNumber(agg.total),
      unit: agg.unit || '',
    }));

  const productionUnits = Array.from(unitMap.values())
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      const byColtura = a.coltura.localeCompare(b.coltura);
      if (byColtura !== 0) return byColtura;
      return a.varieta.localeCompare(b.varieta);
    })
    .map((u) => ({
      idApp: u.idApp,
      name: u.name,
      codice: u.codice,
      coltura: u.coltura,
      varieta: u.varieta,
      comune: u.comune,
      provincia: u.provincia,
      regione: u.regione,
      superficie: typeof u.superficie === 'number' ? formatItalianNumber(u.superficie) : undefined,
      bio: u.bio,
    }));

  return { products, productionUnits } as const;
}

/**
 * Build per-production-unit treatments with distribution date and dosage from CSV dataset.
 * It returns one entry per unit with the list of product uses (not aggregated),
 * including registration number if found via FTS dataset.
 */
export async function getCompanyUnitTreatmentsWithDatesByYear(
  year: number,
  companyName: string,
  csvFilePath?: string,
  ftsCsvPath?: string,
  ftsJsonPath?: string,
  filters?: { readonly crop?: string; readonly variety?: string },
): Promise<
  ReadonlyArray<{
    readonly unitProductionId: string;
    readonly cropName: string;
    readonly variety: string;
    readonly products: ReadonlyArray<{
      readonly name: string;
      readonly regNumber: string;
      readonly data_distribuzione: string; // ISO date string
      readonly dosaggio: number;
      readonly dosaggio_um: string;
    }>;
  }>
> {
  const datasetPath = getDatasetPath(csvFilePath);
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`CSV dataset not found at: ${datasetPath}`);
  }

  const csvContent = fs.readFileSync(datasetPath, { encoding: 'utf-8' });
  const rows = parseCsvRows(csvContent);
  const companyNeedle = (companyName || '').trim().toLowerCase();
  if (!companyNeedle) {
    throw new Error('Missing company name');
  }

  // Build product name -> regNumber index from FTS dataset (prefer JSON, fallback CSV)
  let ftsIndex: ReadonlyMap<string, string> = new Map();
  const jsonPath = getFtsJsonPath(ftsJsonPath);
  if (fs.existsSync(jsonPath)) {
    const jsonContent = fs.readFileSync(jsonPath, { encoding: 'utf-8' });
    ftsIndex = buildFtsNameToRegIndexFromJson(jsonContent);
  }
  if (ftsIndex.size === 0) {
    const csvPathResolved = getFtsCsvPath(ftsCsvPath);
    if (!fs.existsSync(csvPathResolved)) {
      throw new Error(`FTS dataset not found at: ${jsonPath} or ${csvPathResolved}`);
    }
    const ftsCsvContent = fs.readFileSync(csvPathResolved, { encoding: 'utf-8' });
    ftsIndex = buildFtsNameToRegIndexFromCsv(ftsCsvContent);
  }

  function toIsoDate(ddmmyyyy: string): string {
    const parts = (ddmmyyyy || '').split('/');
    if (parts.length !== 3) return '';
    const d = Number(parts[0]);
    const m = Number(parts[1]);
    const y = Number(parts[2]);
    if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return '';
    const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    return date.toISOString();
  }

  function stripRegistrationFromName(rawName: string): string {
    return (rawName || '').replace(/\s*\(\s*reg\.?\s*n\.?[^)]*\)/i, '').trim();
  }

  type UnitKey = string;
  const units: Map<
    UnitKey,
    {
      unitProductionId: string;
      cropName: string;
      variety: string;
      products: Array<{
        name: string;
        regNumber: string;
        data_distribuzione: string;
        dosaggio: number;
        dosaggio_um: string;
      }>;
    }
  > = new Map();

  const cropFilter = (filters?.crop || '').trim().toLowerCase();
  const varietyFilter = (filters?.variety || '').trim().toLowerCase();

  for (const row of rows) {
    if (extractYear(row['DATA_INTERVENTO'] ?? '') !== year) continue;
    const company = (row['AZIENDA'] ?? '').trim().toLowerCase();
    if (!company || company !== companyNeedle) continue;

    const name = (row['APPEZZAMENTO'] ?? '').trim();
    const codice = (row['CODICE'] ?? '').trim();
    const crop = (row['COLTURA'] ?? '').trim();
    const variety = (row['VARIETA'] ?? '').trim();
    const productRaw = (row['PRODOTTO'] ?? '').trim();
    const qtyTotStr = (row['QTA_TOT'] ?? '').trim();
    const qtyHaStr = (row['QTA_HA'] ?? '').trim();
    const unit = (row['UDM'] ?? '').trim();
    const dateStr = (row['DATA_INTERVENTO'] ?? '').trim();
    const idApp = String(row['ID_APP'] ?? '').trim();

    if (!name || !crop || !productRaw || !dateStr) continue;
    if (cropFilter && crop.toLowerCase() !== cropFilter) continue;
    if (varietyFilter && variety.toLowerCase() !== varietyFilter) continue;

    const key: UnitKey = idApp ? `ID:${idApp}` : `${name}||${crop}||${variety}||${codice}`;
    if (!units.has(key)) {
      units.set(key, {
        unitProductionId: idApp || key,
        cropName: crop,
        variety: variety,
        products: [],
      });
    }
    const u = units.get(key)!;

    const reg = findRegNumberForName(productRaw, ftsIndex) || '';
    const iso = toIsoDate(dateStr);
    const qtyHa = parseItalianNumber(qtyHaStr);
    const qtyTot = parseItalianNumber(qtyTotStr);
    const hasPerHa = Number.isFinite(qtyHa) && qtyHa > 0;
    const dosaggio = hasPerHa ? qtyHa : qtyTot;
    const normalizedUnit = unit.toLowerCase() === 'lt' ? 'L' : unit;
    const dosaggio_um = hasPerHa ? `${normalizedUnit}/ha` : normalizedUnit;

    u.products.push({
      name: stripRegistrationFromName(productRaw),
      regNumber: reg,
      data_distribuzione: iso,
      dosaggio,
      dosaggio_um,
    });
  }

  const out = Array.from(units.values()).sort((a, b) =>
    a.unitProductionId.localeCompare(b.unitProductionId),
  );
  return out;
}
