import { JobCategory, Product } from '@prisma/client';
import { Label, LabelDoseDetail, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { prisma } from '../../../repositories/Prisma';
import { createCachedBdfClient, findBestDirectMatch } from '../../integrations/bdf';
import type { BdfDose } from '../../integrations/bdf/types';
import { llmMatchAgronomicNames } from '../shared/llmAgronomicMatcher';

export interface ProductConstraints {
  doseMin: number | null;
  doseMax: number | null;
  doseUnit: string | null;
  maxApplications: number | null;
  minIntervalDays: number;
  epocaImpiego: string | null;
  source: string[];
  warnings?: string[];
}

export function hasExplicitOptimizationIntent(request: string): boolean {
  const normalized = request.toLowerCase();
  const keywords = ['ottim', 'distribu', 'spalma', 'piu giorni', 'split', 'finestra'];
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function toIsoDateTime(date: Date): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  ).toISOString();
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function diffDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function clamp(value: number, min: number | null, max: number | null): number {
  const withMin = min !== null ? Math.max(value, min) : value;
  return max !== null ? Math.min(withMin, max) : withMin;
}

export function getCoverageHint(
  category: JobCategory,
  label: Label | null,
  request: string,
): boolean {
  if (category !== JobCategory.TREATMENT) return false;
  const fromLabel = (label?.categoria || '').toLowerCase().includes('fungicid');
  const normalizedRequest = request.toLowerCase();
  const fromRequest =
    normalizedRequest.includes('fungicid') || normalizedRequest.includes('copertura');
  return fromLabel || fromRequest;
}

export async function pickDoseDetail(
  label: Label | null,
  cropName: string,
  avversity: string | null,
): Promise<LabelDoseDetail | null> {
  if (!label || !label.dosaggi_dettagliati.length) return null;

  // Try crop + adversity match via LLM
  for (const detail of label.dosaggi_dettagliati) {
    const detailCrop = detail.coltura || '';
    if (!detailCrop) continue;
    const cropResult = await llmMatchAgronomicNames({
      nameA: detailCrop,
      nameB: cropName,
      entityType: 'crop',
    });
    if (!cropResult.isMatch) continue;

    if (!avversity) return detail;

    const detailMalattia = detail.malattia || '';
    if (!detailMalattia) return detail;

    const advResult = await llmMatchAgronomicNames({
      nameA: detailMalattia,
      nameB: avversity,
      entityType: 'adversity',
    });
    if (advResult.isMatch) return detail;
  }

  // Fallback: crop-only match via LLM
  for (const detail of label.dosaggi_dettagliati) {
    const detailCrop = detail.coltura || '';
    if (!detailCrop) continue;
    const cropResult = await llmMatchAgronomicNames({
      nameA: detailCrop,
      nameB: cropName,
      entityType: 'crop',
    });
    if (cropResult.isMatch) return detail;
  }

  // Last resort: first detail (no match found)
  return label.dosaggi_dettagliati[0] || null;
}

export function buildDistributedDates(
  startDate: Date,
  endDate: Date,
  desiredCount: number,
  minIntervalDays: number,
): ReadonlyArray<Date> {
  if (desiredCount <= 1) return [startDate];
  const span = diffDays(startDate, endDate);
  const capacityByInterval = Math.floor(span / Math.max(1, minIntervalDays)) + 1;
  const safeCount = Math.max(1, Math.min(desiredCount, capacityByInterval));
  if (safeCount <= 1) return [startDate];
  const uniformStep = Math.max(minIntervalDays, Math.floor(span / (safeCount - 1)));
  const dates: Date[] = [startDate];
  for (let i = 1; i < safeCount; i++) {
    const candidate = addDays(startDate, uniformStep * i);
    if (candidate.getTime() > endDate.getTime()) break;
    dates.push(candidate);
  }
  return dates;
}

export async function resolveConstraints(params: {
  readonly product: Product;
  readonly cropName: string;
  readonly avversity: string | null;
}): Promise<ProductConstraints> {
  const constraints: ProductConstraints = {
    doseMin: null,
    doseMax: null,
    doseUnit: null,
    maxApplications: null,
    minIntervalDays: 7,
    epocaImpiego: null,
    source: [],
  };
  const registrationNumber = params.product.registrationNumber?.trim();
  if (registrationNumber) {
    const extraction = await prisma.labelExtraction.findFirst({
      where: { registrationNumber, isArchived: false },
      orderBy: { updatedAt: 'desc' },
    });
    const labelPayload = extraction?.label as unknown;
    const label = isFitoLabel(labelPayload) ? (labelPayload as Label) : null;
    const detail = await pickDoseDetail(label, params.cropName, params.avversity);
    if (detail) {
      constraints.doseMin = detail.dose_minima ?? null;
      constraints.doseMax = detail.dose_massima ?? null;
      constraints.doseUnit = detail.dose_um ?? null;
      constraints.maxApplications = detail.n_max_applicazioni ?? null;
      constraints.minIntervalDays = detail.intervallo_min_giorni ?? 7;
      constraints.epocaImpiego = detail.epoca_impiego ?? null;
      constraints.source = [...constraints.source, `label:${registrationNumber}`];
    }
  }
  const hasBdfCredentials =
    !!process.env.URL_SERVER_BDF && !!process.env.USERNAME_BDF && !!process.env.PASSWORD_BDF;
  if (!hasBdfCredentials) return constraints;
  try {
    const bdf = createCachedBdfClient();
    const products = await bdf.getProdotti({ ricalfa: params.product.name });
    const selectedProduct =
      products.find((item) => registrationNumber && item.NUM_REG === registrationNumber) ||
      products.find(
        (item) => item.NOME_COMMERCIALE.toLowerCase() === params.product.name.toLowerCase(),
      );
    if (!selectedProduct) {
      console.warn(
        `[resolveConstraints] No BDF product match for "${params.product.name}" (reg: ${registrationNumber ?? 'N/A'}). Skipping BDF enrichment.`,
      );
      return constraints;
    }
    const crops = await bdf.getColture();
    const crop = findBestDirectMatch(params.cropName, crops, (entry) => entry.NOME_COLTURA);
    if (!crop || !params.avversity) return constraints;
    const adversities = await bdf.getAvversita(crop.ID_PV);
    const adversity = findBestDirectMatch(params.avversity, adversities, (entry) => entry.NOME_ITA);
    if (!adversity) return constraints;
    const doses = await bdf.getDosi({
      codprod: selectedProduct.COD_PRODOTTO,
      coltura: crop.ID_PV,
      avversita: adversity.COD_AVVERSITA,
    });
    if (!doses.length) return constraints;
    const validDoses = doses.filter((dose) => dose.DOSE_MAX !== null || dose.DOSE_MIN !== null);
    const bdfDose = validDoses[0] || doses[0];
    const bdfMaxApps = doses
      .map((dose: BdfDose) => dose.NUM_MAX_INT)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    constraints.doseMin = bdfDose.DOSE_MIN ?? constraints.doseMin;
    constraints.doseMax = bdfDose.DOSE_MAX ?? constraints.doseMax;
    constraints.doseUnit = bdfDose.DECO_UM_DOSE ?? constraints.doseUnit;
    constraints.maxApplications =
      bdfMaxApps.length > 0 ? Math.max(...bdfMaxApps) : constraints.maxApplications;
    constraints.minIntervalDays = bdfDose.INTERV_TRATT ?? constraints.minIntervalDays;
    constraints.epocaImpiego = bdfDose.EPOCA_INTERVENTO ?? constraints.epocaImpiego;
    constraints.source = [...constraints.source, 'bdf:doses'];
    return constraints;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(
      `[resolveConstraints] BDF enrichment failed for "${params.product.name}": ${msg}`,
    );
    constraints.warnings = [
      ...(constraints.warnings ?? []),
      `Dati BDF non disponibili per ${params.product.name}: vincoli dose potenzialmente incompleti`,
    ];
    return constraints;
  }
}
