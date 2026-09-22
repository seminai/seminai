import { UnitAllowedProductsWithDosageOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';

export interface DatasetUnitTreatmentItem {
  readonly unitProductionId: string;
  readonly cropName: string;
  readonly variety: string;
  readonly products: ReadonlyArray<{
    readonly name: string;
    readonly regNumber: string;
    readonly data_distribuzione: string;
    readonly dosaggio: number;
    readonly dosaggio_um: string;
  }>;
}

export interface ProductTotalComparison {
  readonly regNumber: string;
  readonly name: string;
  readonly groundTruthTotal: number;
  readonly llmTotal: number;
  readonly groundTruthApplications: number;
  readonly llmApplications: number;
  readonly unit: string;
  readonly diff: number;
  readonly diffPercent: number;
  readonly groundTruthAverageDose: number;
  readonly llmAverageDose: number;
  readonly groundTruthPeriodStart?: string;
  readonly groundTruthPeriodEnd?: string;
  readonly llmPeriodStart?: string;
  readonly llmPeriodEnd?: string;
  readonly applicationCountMatch: boolean;
  readonly doseMatch: boolean;
  readonly periodMatch: boolean;
}

export interface UnitMetrics {
  readonly unitProductionId: string;
  readonly cropName: string;
  readonly totalGroundTruthTreatments: number;
  readonly matchedTreatments: number;
  readonly matchRate: number;
  readonly productTotals: ReadonlyArray<ProductTotalComparison>;
}

export interface Match2Report {
  readonly company: string;
  readonly year: number;
  readonly units: ReadonlyArray<UnitMetrics>;
  readonly totalGroundTruthTreatments: number;
  readonly totalMatchedTreatments: number;
  readonly overallMatchRate: number;
}

export interface AggregatedProductStats {
  readonly regNumber: string;
  readonly name: string;
  readonly unit: string;
  readonly totalDose: number;
  readonly applications: number;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
}

export const PERIOD_TOLERANCE_DAYS = 30;

export const DOSE_TOLERANCE_RATIO = 0.2;

export function normalizeRegNumber(value: string): string {
  const trimmed = String(value || '').trim();
  const withoutLeadingZeros = trimmed.replace(/^0+/, '');
  return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : '0';
}

export function isSimilarDose(dose1: number, dose2: number): boolean {
  const tolerance = DOSE_TOLERANCE_RATIO;
  const diff = Math.abs(dose1 - dose2);
  const avg = (dose1 + dose2) / 2;
  return diff <= avg * tolerance;
}

export function isSameUnit(um1: string, um2: string): boolean {
  const u1 = um1.toLowerCase().trim();
  const u2 = um2.toLowerCase().trim();
  return u1 === u2;
}

export function parseDate(input?: string | Date): Date | undefined {
  if (!input) return undefined;
  const parsed = typeof input === 'string' ? new Date(input) : input;
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function pickEarlierDate(valueA?: Date, valueB?: Date): Date | undefined {
  if (!valueA) return valueB;
  if (!valueB) return valueA;
  return valueA <= valueB ? valueA : valueB;
}

export function pickLaterDate(valueA?: Date, valueB?: Date): Date | undefined {
  if (!valueA) return valueB;
  if (!valueB) return valueA;
  return valueA >= valueB ? valueA : valueB;
}

export function computeAverageDose(totalDose: number, applications: number): number {
  if (applications === 0) return 0;
  return totalDose / applications;
}

export function isWithinDays(dateA?: Date, dateB?: Date, toleranceDays?: number): boolean {
  if (!dateA || !dateB || toleranceDays === undefined) return false;
  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= toleranceDays;
}

export function getPeriodReference(stats?: AggregatedProductStats): Date | undefined {
  if (!stats) return undefined;
  if (stats.periodStart && stats.periodEnd) {
    return new Date((stats.periodStart.getTime() + stats.periodEnd.getTime()) / 2);
  }
  return stats.periodStart || stats.periodEnd;
}

export function arePeriodsComparable(
  gt: AggregatedProductStats,
  llm: AggregatedProductStats,
  toleranceDays: number,
): boolean {
  const gtReference = getPeriodReference(gt);
  const llmReference = getPeriodReference(llm);
  if (!gtReference || !llmReference) return false;
  return isWithinDays(gtReference, llmReference, toleranceDays);
}

export function aggregateGroundTruthProducts(
  gtProducts: ReadonlyArray<{
    readonly name: string;
    readonly regNumber: string;
    readonly data_distribuzione: string;
    readonly dosaggio: number;
    readonly dosaggio_um: string;
  }>,
): Map<string, AggregatedProductStats> {
  const aggregates = new Map<string, AggregatedProductStats>();
  for (const product of gtProducts) {
    const reg = normalizeRegNumber(product.regNumber);
    const prev = aggregates.get(reg);
    const date = parseDate(product.data_distribuzione);
    const next: AggregatedProductStats = {
      regNumber: reg,
      name: prev?.name || product.name,
      unit: prev?.unit || product.dosaggio_um,
      totalDose: (prev?.totalDose || 0) + product.dosaggio,
      applications: (prev?.applications || 0) + 1,
      periodStart: pickEarlierDate(prev?.periodStart, date),
      periodEnd: pickLaterDate(prev?.periodEnd, date),
    };
    aggregates.set(reg, next);
  }
  return aggregates;
}

export function aggregateLlmProducts(
  llmUnit: UnitAllowedProductsWithDosageOutput,
): Map<string, AggregatedProductStats> {
  const aggregates = new Map<string, AggregatedProductStats>();
  for (const product of llmUnit.products || []) {
    const reg = normalizeRegNumber((product as { regNumber?: string }).regNumber || '');
    if (!reg) continue;
    const treatments =
      (
        product as {
          trattamenti?: ReadonlyArray<{
            data_distribuzione?: Date;
            dose?: number;
            dosaggio_um?: string;
          }>;
        }
      ).trattamenti || [];
    if (treatments.length === 0) continue;
    let totalDose = 0;
    let applications = 0;
    let periodStart: Date | undefined;
    let periodEnd: Date | undefined;
    let unit = '';
    for (const treatment of treatments) {
      if (typeof treatment.dose === 'number') {
        totalDose += treatment.dose;
      }
      const date = parseDate(treatment.data_distribuzione);
      periodStart = pickEarlierDate(periodStart, date);
      periodEnd = pickLaterDate(periodEnd, date);
      unit = unit || treatment.dosaggio_um || '';
      applications += 1;
    }
    const prev = aggregates.get(reg);
    const next: AggregatedProductStats = {
      regNumber: reg,
      name: prev?.name || (product as { name?: string }).name || '',
      unit: prev?.unit || unit,
      totalDose: (prev?.totalDose || 0) + totalDose,
      applications: (prev?.applications || 0) + applications,
      periodStart: pickEarlierDate(prev?.periodStart, periodStart),
      periodEnd: pickLaterDate(prev?.periodEnd, periodEnd),
    };
    aggregates.set(reg, next);
  }
  return aggregates;
}

export function calculateProductTotals(
  gtAggregates: Map<string, AggregatedProductStats>,
  llmAggregates: Map<string, AggregatedProductStats>,
): ReadonlyArray<ProductTotalComparison> {
  const comparisons: ProductTotalComparison[] = [];
  const allRegs = new Set([...gtAggregates.keys(), ...llmAggregates.keys()]);
  for (const reg of allRegs) {
    const gt = gtAggregates.get(reg);
    const llm = llmAggregates.get(reg);
    const gtTotal = gt?.totalDose || 0;
    const llmTotal = llm?.totalDose || 0;
    const diff = llmTotal - gtTotal;
    const gtApplications = gt?.applications || 0;
    const llmApplications = llm?.applications || 0;
    const gtAverageDose = computeAverageDose(gtTotal, gtApplications);
    const llmAverageDose = computeAverageDose(llmTotal, llmApplications);
    const periodMatch = Boolean(gt && llm && arePeriodsComparable(gt, llm, PERIOD_TOLERANCE_DAYS));
    const doseMatch =
      gtApplications === 0 && llmApplications === 0
        ? true
        : Boolean(
            gt &&
              llm &&
              gtAverageDose > 0 &&
              llmAverageDose > 0 &&
              isSimilarDose(gtAverageDose, llmAverageDose),
          );
    const applicationsMatch = Boolean(gt && llm && gtApplications === llmApplications);
    comparisons.push({
      regNumber: reg,
      name: gt?.name || llm?.name || '',
      groundTruthTotal: gtTotal,
      llmTotal,
      groundTruthApplications: gtApplications,
      llmApplications,
      unit: gt?.unit || llm?.unit || '',
      diff,
      diffPercent: gtTotal > 0 ? (diff / gtTotal) * 100 : 0,
      groundTruthAverageDose: gtAverageDose,
      llmAverageDose,
      groundTruthPeriodStart: gt?.periodStart?.toISOString(),
      groundTruthPeriodEnd: gt?.periodEnd?.toISOString(),
      llmPeriodStart: llm?.periodStart?.toISOString(),
      llmPeriodEnd: llm?.periodEnd?.toISOString(),
      applicationCountMatch: applicationsMatch,
      doseMatch,
      periodMatch,
    });
  }
  return comparisons.sort((a, b) => a.name.localeCompare(b.name));
}
