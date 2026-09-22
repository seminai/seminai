import fs from 'fs';
import { buildFtsNameToRegIndexFromCsv, buildFtsNameToRegIndexFromJson, extractYear, findRegNumberForName, getDatasetPath, getFtsCsvPath, getFtsJsonPath, parseCsvRows, toBoolean } from './get_year_crop_field.part-01-treatment-details';
import { cleanProductName, formatItalianNumber, parseItalianNumber } from './get_year_crop_field.part-02-get-year-crop-fields';

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
