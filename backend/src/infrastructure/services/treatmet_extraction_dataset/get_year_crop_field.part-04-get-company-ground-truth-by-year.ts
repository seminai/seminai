import fs from 'fs';
import { buildFtsNameToRegIndexFromCsv, buildFtsNameToRegIndexFromJson, extractYear, findRegNumberForName, getDatasetPath, getFtsCsvPath, getFtsJsonPath, parseCsvRows, toBoolean } from './get_year_crop_field.part-01-treatment-details';
import { cleanProductName, formatItalianNumber, parseItalianNumber } from './get_year_crop_field.part-02-get-year-crop-fields';

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
