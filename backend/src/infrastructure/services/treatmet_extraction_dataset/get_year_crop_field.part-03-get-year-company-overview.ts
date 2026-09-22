import fs from 'fs';
import { CompanyOverviewItem, YearCompanyOverviewResponse, cleanProductName, formatItalianNumber, parseItalianNumber } from './get_year_crop_field.part-02-get-year-crop-fields';
import { buildFtsNameToRegIndexFromCsv, buildFtsNameToRegIndexFromJson, extractYear, findRegNumberForName, getDatasetPath, getFtsCsvPath, getFtsJsonPath, parseCsvRows } from './get_year_crop_field.part-01-treatment-details';

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
