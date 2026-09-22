import fs from 'fs';
import { CompanyField, CompanyFields, YearCropFieldsResponse, buildTreatment, extractYear, getDatasetPath, parseCsvRows } from './get_year_crop_field.part-01-treatment-details';

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

export interface TreatmentSummaryItem {
  readonly name: string; // lowercased, cleaned product name
  readonly quantity: string; // total quantity across rows (formatted with comma decimals)
  readonly udm: string; // unit of measure from CSV (UDM)
}

export interface CompanyFieldSummary {
  readonly name: string;
  readonly crop: string;
  readonly variety: string;
  readonly treatments: readonly TreatmentSummaryItem[];
}

export interface CompanyFieldsSummary {
  readonly company: string;
  readonly fields: readonly CompanyFieldSummary[];
}

export type YearCropFieldsSummaryResponse = ReadonlyArray<CompanyFieldsSummary>;

export function parseItalianNumber(input: string): number {
  if (!input) return 0;
  const sanitized = input
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .replace(/"/g, '')
    .replace(',', '.');
  const num = Number(sanitized);
  return Number.isFinite(num) ? num : 0;
}

export function formatItalianNumber(value: number): string {
  const fixed = value.toFixed(6);
  const trimmed = fixed.replace(/0+$/g, '').replace(/\.$/, '');
  return trimmed.replace('.', ',');
}

export function cleanProductName(rawName: string): string {
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

export interface CompanyFieldLight {
  readonly name: string;
  readonly crop: string;
  readonly variety: string;
  readonly surfaceHa?: string;
}

export interface CompanyOverviewTreatment {
  readonly name: string;
  readonly regNumber: string;
  readonly quantity: string;
  readonly udm: string;
}

export interface CompanyOverviewItem {
  readonly company: string;
  readonly fields: readonly CompanyFieldLight[];
  readonly treatments: readonly CompanyOverviewTreatment[];
}

export type YearCompanyOverviewResponse = ReadonlyArray<CompanyOverviewItem>;
