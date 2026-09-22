import fs from 'fs';
import { buildFtsNameToRegIndexFromCsv, buildFtsNameToRegIndexFromJson, extractYear, findRegNumberForName, getDatasetPath, getFtsCsvPath, getFtsJsonPath, parseCsvRows } from './get_year_crop_field.part-01-treatment-details';
import { parseItalianNumber } from './get_year_crop_field.part-02-get-year-crop-fields';

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
