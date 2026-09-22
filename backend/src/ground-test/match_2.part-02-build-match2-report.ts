import { UnitAllowedProductsWithDosageOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { DatasetUnitTreatmentItem, Match2Report, PERIOD_TOLERANCE_DAYS, ProductTotalComparison, UnitMetrics, aggregateGroundTruthProducts, aggregateLlmProducts, arePeriodsComparable, calculateProductTotals, computeAverageDose, isSameUnit, isSimilarDose } from './match_2.part-01-dataset-unit-treatment-item';

export function buildMatch2Report(input: {
  readonly company: string;
  readonly year: number;
  readonly llm: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly dataset: ReadonlyArray<DatasetUnitTreatmentItem>;
}): Match2Report {
  const unitMetrics: UnitMetrics[] = [];
  let totalGroundTruthTreatments = 0;
  let totalMatchedTreatments = 0;

  for (const gtUnit of input.dataset) {
    const unitId = gtUnit.unitProductionId;
    const llmUnit = input.llm.find((u) => u.unitProductionId === unitId);
    let unitGroundTruthCount = 0;
    let unitMatchedCount = 0;

    const gtProducts = gtUnit.products || [];
    const gtAggregated = aggregateGroundTruthProducts(gtProducts);
    unitGroundTruthCount = gtAggregated.size;
    totalGroundTruthTreatments += unitGroundTruthCount;

    if (!llmUnit) {
      const productTotals = calculateProductTotals(gtAggregated, new Map());
      unitMetrics.push({
        unitProductionId: unitId,
        cropName: gtUnit.cropName,
        totalGroundTruthTreatments: unitGroundTruthCount,
        matchedTreatments: 0,
        matchRate: 0,
        productTotals,
      });
      continue;
    }

    const llmAggregated = aggregateLlmProducts(llmUnit);
    for (const [reg, gtData] of gtAggregated.entries()) {
      const llmData = llmAggregated.get(reg);
      if (!llmData) continue;
      const applicationsMatch = gtData.applications === llmData.applications;
      const avgGtDose = computeAverageDose(gtData.totalDose, gtData.applications);
      const avgLlmDose = computeAverageDose(llmData.totalDose, llmData.applications);
      const doseMatch =
        gtData.applications === 0 && llmData.applications === 0
          ? true
          : avgGtDose > 0 && avgLlmDose > 0 && isSimilarDose(avgGtDose, avgLlmDose);
      const unitMatch =
        !gtData.unit || !llmData.unit ? true : isSameUnit(gtData.unit, llmData.unit);
      const periodMatch = arePeriodsComparable(gtData, llmData, PERIOD_TOLERANCE_DAYS);
      if (applicationsMatch && doseMatch && periodMatch && unitMatch) {
        unitMatchedCount += 1;
        totalMatchedTreatments += 1;
      }
    }

    const productTotals = calculateProductTotals(gtAggregated, llmAggregated);

    const matchRate = unitGroundTruthCount > 0 ? unitMatchedCount / unitGroundTruthCount : 0;
    unitMetrics.push({
      unitProductionId: unitId,
      cropName: gtUnit.cropName,
      totalGroundTruthTreatments: unitGroundTruthCount,
      matchedTreatments: unitMatchedCount,
      matchRate,
      productTotals,
    });
  }

  const overallMatchRate =
    totalGroundTruthTreatments > 0 ? totalMatchedTreatments / totalGroundTruthTreatments : 0;

  return {
    company: input.company,
    year: input.year,
    units: unitMetrics,
    totalGroundTruthTreatments,
    totalMatchedTreatments,
    overallMatchRate,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABULAR REPORT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function formatDate(isoString?: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

export function formatDateRange(start?: string, end?: string): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s === '—' && e === '—') return '—';
  if (s === e || e === '—') return s;
  if (s === '—') return e;
  return `${s} → ${e}`;
}

export function daysBetweenDates(date1?: string, date2?: string): number | null {
  if (!date1 || !date2) return null;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function calcDateOffset(gt: ProductTotalComparison, llm: ProductTotalComparison): string {
  const gtMid = gt.groundTruthPeriodStart || gt.groundTruthPeriodEnd;
  const llmMid = llm.llmPeriodStart || llm.llmPeriodEnd;
  const days = daysBetweenDates(gtMid, llmMid);
  if (days === null) return '—';
  if (days === 0) return '0';
  const llmDate = new Date(llmMid!);
  const gtDate = new Date(gtMid!);
  const sign = llmDate > gtDate ? '+' : '-';
  return `${sign}${days}g`;
}

export function calcDoseDiff(gt: number, llm: number): string {
  if (gt === 0 && llm === 0) return '0%';
  if (gt === 0) return '+∞';
  const diffPercent = ((llm - gt) / gt) * 100;
  const sign = diffPercent >= 0 ? '+' : '';
  return `${sign}${diffPercent.toFixed(0)}%`;
}

export function pad(str: string, len: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const s = String(str).substring(0, len);
  const padding = len - s.length;
  if (padding <= 0) return s;
  if (align === 'right') return ' '.repeat(padding) + s;
  if (align === 'center') {
    const left = Math.floor(padding / 2);
    return ' '.repeat(left) + s + ' '.repeat(padding - left);
  }
  return s + ' '.repeat(padding);
}

export function getStatusIcon(apps: boolean, dose: boolean, period: boolean): string {
  const allMatch = apps && dose && period;
  if (allMatch) return '✅';
  const partialMatch = apps || dose || period;
  if (partialMatch) return '⚠️';
  return '❌';
}

export function getCheckIcon(value: boolean): string {
  return value ? '✓' : '✗';
}
