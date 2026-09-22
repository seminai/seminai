import { Prisma } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { cleanRegNumber } from '../dosage_agent/cleanRegNumber';
import { isFitoLabel, Label } from '../../../../domain/dtos/label.dto';
import { createCachedBdfClient, findBestDirectMatch } from '../../integrations/bdf';
import { createEnsureLabelExistsUseCase } from '../../../../application/use-cases/label/EnsureLabelExistsUseCase';
import { CsvBdfLabelDatasetRepository } from '../../../repositories/CsvBdfLabelDatasetRepository';

export type CropResolutionSource =
  | 'label_db'
  | 'bdf'
  | 'fito_extracted'
  | 'fertilizer_extracted'
  | 'csv_dataset'
  | 'none';

export interface CropResolution {
  readonly authorizedCrops: ReadonlyArray<string>;
  readonly source: CropResolutionSource;
}

const NONE: CropResolution = { authorizedCrops: [], source: 'none' };
let csvRepo: CsvBdfLabelDatasetRepository | null = null;

/**
 * Resolves authorized crops for a product using a 4-tier waterfall:
 *  1. LabelExtraction DB
 *  2. BDF API (cached)
 *  3. EnsureLabelExistsUseCase (FITO via SIAN, FERTILIZER via Tavily) — extracts and persists
 *  4. Local BDF dataset CSV (last resort, may be stale)
 */
export async function resolveProductCrops(
  productName: string,
  registrationNumber: string,
): Promise<CropResolution> {
  const name = (productName ?? '').trim();
  const regNum = (registrationNumber ?? '').trim();

  const fromDb = await tryDbLookup(name, regNum);
  if (fromDb) return fromDb;

  const fromBdf = await tryBdfLookup(name);
  if (fromBdf) return fromBdf;

  const fromEnsure = await tryEnsureLabelExtraction(name, regNum);
  if (fromEnsure) return fromEnsure;

  const fromCsv = await tryCsvDataset(name, regNum);
  if (fromCsv) return fromCsv;

  return NONE;
}

async function tryDbLookup(name: string, regNum: string): Promise<CropResolution | null> {
  const orConditions = buildLabelLookupConditions(regNum, name);
  if (orConditions.length === 0) return null;
  const labelRow = await prisma.labelExtraction.findFirst({
    where: { isArchived: false, OR: orConditions },
  });
  if (!labelRow || !isFitoLabel(labelRow.label)) return null;
  const crops = collectCrops(labelRow.label as Label);
  if (crops.length === 0) return null;
  return { authorizedCrops: crops, source: 'label_db' };
}

async function tryBdfLookup(name: string): Promise<CropResolution | null> {
  const baseUrl = process.env.URL_SERVER_BDF;
  const username = process.env.USERNAME_BDF;
  const password = process.env.PASSWORD_BDF;
  if (!baseUrl || !username || !password || name.length < 3) return null;
  try {
    const bdfClient = createCachedBdfClient();
    const products = await bdfClient.getProdotti({ ricalfa: name });
    if (products.length === 0) return null;
    const matched = findBestDirectMatch(name, products, (p) => p.NOME_COMMERCIALE);
    if (!matched) return null;
    const impieghi = await bdfClient.getImpieghi(matched.COD_PRODOTTO);
    const crops = impieghi.map((i) => i.NOME).filter((c): c is string => Boolean(c));
    if (crops.length === 0) return null;
    return { authorizedCrops: crops, source: 'bdf' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown BDF error';
    console.warn(`[resolveProductCrops] BDF lookup failed for "${name}": ${msg}`);
    return null;
  }
}

async function tryEnsureLabelExtraction(
  name: string,
  regNum: string,
): Promise<CropResolution | null> {
  if (!name) return null;
  try {
    const useCase = createEnsureLabelExistsUseCase();
    const outcome = await useCase.execute({ productName: name, registrationNumber: regNum });
    if (!outcome.record) return null;
    if (outcome.source === 'fertilizer_extracted') {
      // FertilizerLabel doesn't carry "authorized crops" in the FITO sense.
      return { authorizedCrops: [], source: 'fertilizer_extracted' };
    }
    if (!isFitoLabel(outcome.record.label)) return null;
    const crops = collectCrops(outcome.record.label as Label);
    if (crops.length === 0) return null;
    return { authorizedCrops: crops, source: 'fito_extracted' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown ensure-label error';
    console.warn(`[resolveProductCrops] Ensure-label failed for "${name}": ${msg}`);
    return null;
  }
}

async function tryCsvDataset(name: string, regNum: string): Promise<CropResolution | null> {
  if (!name && !regNum) return null;
  try {
    if (!csvRepo) csvRepo = new CsvBdfLabelDatasetRepository();
    const detail = await findCsvDetail(csvRepo, name, regNum);
    if (!detail) return null;
    const crops = collectCrops(detail.label as Label);
    if (crops.length === 0) return null;
    return { authorizedCrops: crops, source: 'csv_dataset' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown CSV error';
    console.warn(`[resolveProductCrops] CSV lookup failed for "${name}": ${msg}`);
    return null;
  }
}

async function findCsvDetail(
  repo: CsvBdfLabelDatasetRepository,
  name: string,
  regNum: string,
): Promise<{ label: unknown } | null> {
  if (regNum) {
    const pairs = await repo.listAvailablePairs();
    const byReg = pairs.find((p) => p.registrationNumber.trim() === regNum);
    if (byReg) {
      return repo.findDetailByProductAndRegistration({
        productName: byReg.productName,
        registrationNumber: byReg.registrationNumber,
      });
    }
  }
  if (!name) return null;
  const pairs = await repo.listAvailablePairs();
  const lower = name.toLowerCase();
  const byName = pairs.find((p) => p.productName.toLowerCase() === lower);
  if (!byName) return null;
  return repo.findDetailByProductAndRegistration({
    productName: byName.productName,
    registrationNumber: byName.registrationNumber,
  });
}

function buildLabelLookupConditions(
  regNumber: string,
  productName: string,
): Prisma.LabelExtractionWhereInput[] {
  const conditions: Prisma.LabelExtractionWhereInput[] = [];
  if (regNumber) {
    const normalized = cleanRegNumber(regNumber);
    conditions.push({ registrationNumber: regNumber });
    if (normalized && normalized !== regNumber && normalized !== '0') {
      conditions.push({ registrationNumber: normalized });
    }
    if (/^\d+$/.test(normalized)) {
      conditions.push({ registrationNumber: '0' + normalized });
      conditions.push({ registrationNumber: '00' + normalized });
    }
  }
  if (productName) {
    conditions.push({
      productName: { equals: productName, mode: Prisma.QueryMode.insensitive },
    });
  }
  return conditions;
}

function collectCrops(label: Label): string[] {
  return [
    ...new Set([...label.colture_target, ...label.dosaggi_dettagliati.map((d) => d.coltura)]),
  ].filter((c): c is string => Boolean(c));
}

export function describeSource(source: CropResolutionSource): string {
  switch (source) {
    case 'label_db':
      return 'Etichetta DB';
    case 'bdf':
      return 'BDF';
    case 'fito_extracted':
      return 'Etichetta SIAN (estratta on-demand)';
    case 'fertilizer_extracted':
      return 'Scheda fertilizzante (estratta on-demand)';
    case 'csv_dataset':
      return 'Dataset BDF locale (potrebbe essere obsoleto)';
    case 'none':
      return 'Nessuna fonte';
  }
}
