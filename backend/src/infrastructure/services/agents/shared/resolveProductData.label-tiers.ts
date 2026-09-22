import { Prisma } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { cleanRegNumber } from '../dosage_agent/cleanRegNumber';
import { isFitoLabel, Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { createEnsureLabelExistsUseCase } from '../../../../application/use-cases/label/EnsureLabelExistsUseCase';
import { CsvBdfLabelDatasetRepository } from '../../../repositories/CsvBdfLabelDatasetRepository';
import type {
  ProductActiveIngredient,
  ProductDataResolution,
  ProductDataSource,
  ProductDoseInfo,
} from './resolveProductData';

let csvRepo: CsvBdfLabelDatasetRepository | null = null;

function emptyResolution(
  name: string,
  reg: string,
  source: ProductDataSource,
): ProductDataResolution {
  return {
    productName: name,
    registrationNumber: reg,
    activeIngredients: [],
    category: null,
    bio: null,
    revoked: null,
    doses: [],
    meccanismo_azione_frac: null,
    fasce_rispetto_acqua: null,
    source,
  };
}

/** Tier 2: internal LabelExtraction DB (keyed by product name / registration). */
export async function tryDbLabel(
  name: string,
  regNum: string,
  cropName?: string,
): Promise<ProductDataResolution | null> {
  const label = await lookupLabelRecord(name, regNum);
  if (!label) return null;
  return labelToResolution(label, name, regNum, cropName, 'label_db');
}

/** Tier 3: on-demand SIAN scraping + extraction (persists the label). */
export async function tryEnsureLabel(
  name: string,
  regNum: string,
  cropName?: string,
): Promise<ProductDataResolution | null> {
  if (!name) return null;
  try {
    const outcome = await createEnsureLabelExistsUseCase().execute({
      productName: name,
      registrationNumber: regNum,
    });
    if (!outcome.record) return null;
    if (outcome.source === 'fertilizer_extracted') {
      return emptyResolution(name, regNum, 'fertilizer_extracted');
    }
    if (!isFitoLabel(outcome.record.label)) return null;
    return labelToResolution(
      outcome.record.label as Label,
      name,
      regNum,
      cropName,
      'fito_extracted',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown ensure-label error';
    console.warn(`[resolveProductData] Ensure-label failed for "${name}": ${msg}`);
    return null;
  }
}

/** Tier 4: local BDF dataset CSV (last resort, may be stale). */
export async function tryCsvDataset(
  name: string,
  regNum: string,
  cropName?: string,
): Promise<ProductDataResolution | null> {
  if (!name && !regNum) return null;
  try {
    if (!csvRepo) csvRepo = new CsvBdfLabelDatasetRepository();
    const detail = await findCsvDetail(csvRepo, name, regNum);
    if (!detail || !isFitoLabel(detail.label)) return null;
    return labelToResolution(detail.label as Label, name, regNum, cropName, 'csv_dataset');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown CSV error';
    console.warn(`[resolveProductData] CSV lookup failed for "${name}": ${msg}`);
    return null;
  }
}

/** On a BDF hit, back-fill null-only label-rich fields (FRAC, water buffer) from the DB. */
export async function mergeLabelExtras(
  base: ProductDataResolution,
  name: string,
  regNum: string,
): Promise<ProductDataResolution> {
  if (base.meccanismo_azione_frac && base.fasce_rispetto_acqua) return base;
  const label = await lookupLabelRecord(name, regNum);
  if (!label) return base;
  return {
    ...base,
    meccanismo_azione_frac: base.meccanismo_azione_frac ?? label.meccanismo_azione_frac ?? null,
    fasce_rispetto_acqua: base.fasce_rispetto_acqua ?? label.fasce_rispetto_acqua ?? null,
  };
}

async function lookupLabelRecord(name: string, regNum: string): Promise<Label | null> {
  const orConditions = buildLabelLookupConditions(regNum, name);
  if (orConditions.length === 0) return null;
  const row = await prisma.labelExtraction.findFirst({
    where: { isArchived: false, OR: orConditions },
  });
  if (!row || !isFitoLabel(row.label)) return null;
  return row.label as Label;
}

function labelToResolution(
  label: Label,
  fallbackName: string,
  fallbackReg: string,
  cropName: string | undefined,
  source: ProductDataSource,
): ProductDataResolution {
  const names = splitActiveIngredients(label.principio_attivo);
  const activeIngredients: ProductActiveIngredient[] = names.map((n) => ({
    name: n,
    fracMoa: label.meccanismo_azione_frac ?? null,
  }));
  const doses = label.dosaggi_dettagliati
    .filter((d) => !cropName || matchesCrop(d, cropName))
    .map(mapLabelDose);
  return {
    productName: label.prodotto ?? fallbackName,
    registrationNumber: label.numero_registrazione ?? fallbackReg,
    activeIngredients,
    category: label.categoria ?? null,
    bio: null,
    revoked: null,
    doses,
    meccanismo_azione_frac: label.meccanismo_azione_frac ?? null,
    fasce_rispetto_acqua: label.fasce_rispetto_acqua ?? null,
    source,
  };
}

function mapLabelDose(d: LabelDoseDetail): ProductDoseInfo {
  return {
    coltura: d.coltura,
    malattia: d.malattia ?? null,
    dose_minima: d.dose_minima ?? null,
    dose_massima: d.dose_massima ?? null,
    dose_um: d.dose_um ?? null,
    n_max_applicazioni: d.n_max_applicazioni ?? null,
    intervallo_sicurezza_giorni: d.intervallo_sicurezza_giorni ?? null,
  };
}

function matchesCrop(d: LabelDoseDetail, cropName: string): boolean {
  const a = d.coltura.toLowerCase();
  const b = cropName.toLowerCase();
  return a.includes(b) || b.includes(a);
}

function splitActiveIngredients(principio: string | null): string[] {
  if (!principio) return [];
  return principio
    .split(/\s*[+,;]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
    conditions.push({ productName: { equals: productName, mode: Prisma.QueryMode.insensitive } });
  }
  return conditions;
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
