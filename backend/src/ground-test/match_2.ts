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

interface ProductTotalComparison {
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

interface UnitMetrics {
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

interface AggregatedProductStats {
  readonly regNumber: string;
  readonly name: string;
  readonly unit: string;
  readonly totalDose: number;
  readonly applications: number;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
}

const PERIOD_TOLERANCE_DAYS = 30;
const DOSE_TOLERANCE_RATIO = 0.2;

function normalizeRegNumber(value: string): string {
  const trimmed = String(value || '').trim();
  const withoutLeadingZeros = trimmed.replace(/^0+/, '');
  return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : '0';
}

function isSimilarDose(dose1: number, dose2: number): boolean {
  const tolerance = DOSE_TOLERANCE_RATIO;
  const diff = Math.abs(dose1 - dose2);
  const avg = (dose1 + dose2) / 2;
  return diff <= avg * tolerance;
}

function isSameUnit(um1: string, um2: string): boolean {
  const u1 = um1.toLowerCase().trim();
  const u2 = um2.toLowerCase().trim();
  return u1 === u2;
}

function parseDate(input?: string | Date): Date | undefined {
  if (!input) return undefined;
  const parsed = typeof input === 'string' ? new Date(input) : input;
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function pickEarlierDate(valueA?: Date, valueB?: Date): Date | undefined {
  if (!valueA) return valueB;
  if (!valueB) return valueA;
  return valueA <= valueB ? valueA : valueB;
}

function pickLaterDate(valueA?: Date, valueB?: Date): Date | undefined {
  if (!valueA) return valueB;
  if (!valueB) return valueA;
  return valueA >= valueB ? valueA : valueB;
}

function computeAverageDose(totalDose: number, applications: number): number {
  if (applications === 0) return 0;
  return totalDose / applications;
}

function isWithinDays(dateA?: Date, dateB?: Date, toleranceDays?: number): boolean {
  if (!dateA || !dateB || toleranceDays === undefined) return false;
  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= toleranceDays;
}

function getPeriodReference(stats?: AggregatedProductStats): Date | undefined {
  if (!stats) return undefined;
  if (stats.periodStart && stats.periodEnd) {
    return new Date((stats.periodStart.getTime() + stats.periodEnd.getTime()) / 2);
  }
  return stats.periodStart || stats.periodEnd;
}

function arePeriodsComparable(
  gt: AggregatedProductStats,
  llm: AggregatedProductStats,
  toleranceDays: number,
): boolean {
  const gtReference = getPeriodReference(gt);
  const llmReference = getPeriodReference(llm);
  if (!gtReference || !llmReference) return false;
  return isWithinDays(gtReference, llmReference, toleranceDays);
}

function aggregateGroundTruthProducts(
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

function aggregateLlmProducts(
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

function calculateProductTotals(
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

function formatDate(isoString?: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function formatDateRange(start?: string, end?: string): string {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s === '—' && e === '—') return '—';
  if (s === e || e === '—') return s;
  if (s === '—') return e;
  return `${s} → ${e}`;
}

function daysBetweenDates(date1?: string, date2?: string): number | null {
  if (!date1 || !date2) return null;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function calcDateOffset(gt: ProductTotalComparison, llm: ProductTotalComparison): string {
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

function calcDoseDiff(gt: number, llm: number): string {
  if (gt === 0 && llm === 0) return '0%';
  if (gt === 0) return '+∞';
  const diffPercent = ((llm - gt) / gt) * 100;
  const sign = diffPercent >= 0 ? '+' : '';
  return `${sign}${diffPercent.toFixed(0)}%`;
}

function pad(str: string, len: number, align: 'left' | 'right' | 'center' = 'left'): string {
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

function getStatusIcon(apps: boolean, dose: boolean, period: boolean): string {
  const allMatch = apps && dose && period;
  if (allMatch) return '✅';
  const partialMatch = apps || dose || period;
  if (partialMatch) return '⚠️';
  return '❌';
}

function getCheckIcon(value: boolean): string {
  return value ? '✓' : '✗';
}

export function printMatch2Report(report: Match2Report): void {
  const LINE = '═'.repeat(130);
  const THIN_LINE = '─'.repeat(130);

  console.log('\n' + LINE);
  console.log(`  📊 REPORT CONFRONTO TRATTAMENTI: ${report.company} (${report.year})`);
  console.log(LINE);
  console.log(
    `  Match Rate Complessivo: ${(report.overallMatchRate * 100).toFixed(1)}% (${report.totalMatchedTreatments}/${report.totalGroundTruthTreatments} prodotti)`,
  );
  console.log(LINE + '\n');

  for (const unit of report.units) {
    console.log(`\n  🌱 UNITÀ: ${unit.unitProductionId} (${unit.cropName})`);
    console.log(
      `     Match: ${unit.matchedTreatments}/${unit.totalGroundTruthTreatments} (${(unit.matchRate * 100).toFixed(1)}%)`,
    );
    console.log(THIN_LINE);

    // Header tabella
    console.log(
      '  ' +
        pad('', 2) +
        ' ' +
        pad('PRODOTTO', 24) +
        ' │ ' +
        pad('DOSE GT', 10, 'right') +
        ' │ ' +
        pad('DOSE LLM', 10, 'right') +
        ' │ ' +
        pad('Δ DOSE', 8, 'right') +
        ' │ ' +
        pad('APPS', 7, 'center') +
        ' │ ' +
        pad('PERIODO GT', 15, 'center') +
        ' │ ' +
        pad('PERIODO LLM', 15, 'center') +
        ' │ ' +
        pad('Δ DAYS', 7, 'right') +
        ' │ ' +
        pad('CHECK', 9, 'center'),
    );
    console.log(
      '  ' +
        '─'.repeat(2) +
        '─┼─' +
        '─'.repeat(24) +
        '─┼─' +
        '─'.repeat(10) +
        '─┼─' +
        '─'.repeat(10) +
        '─┼─' +
        '─'.repeat(8) +
        '─┼─' +
        '─'.repeat(7) +
        '─┼─' +
        '─'.repeat(15) +
        '─┼─' +
        '─'.repeat(15) +
        '─┼─' +
        '─'.repeat(7) +
        '─┼─' +
        '─'.repeat(9),
    );

    for (const p of unit.productTotals) {
      const icon = getStatusIcon(p.applicationCountMatch, p.doseMatch, p.periodMatch);
      const gtDoseStr =
        p.groundTruthApplications > 0 ? `${p.groundTruthAverageDose.toFixed(2)} ${p.unit}` : '—';
      const llmDoseStr = p.llmApplications > 0 ? `${p.llmAverageDose.toFixed(2)} ${p.unit}` : '—';
      const doseDiff = calcDoseDiff(p.groundTruthAverageDose, p.llmAverageDose);
      const appsStr = `${p.groundTruthApplications}→${p.llmApplications}`;
      const gtPeriod = formatDateRange(p.groundTruthPeriodStart, p.groundTruthPeriodEnd);
      const llmPeriod = formatDateRange(p.llmPeriodStart, p.llmPeriodEnd);
      const dateDiff = calcDateOffset(p, p);
      const checks = `${getCheckIcon(p.applicationCountMatch)}A ${getCheckIcon(p.doseMatch)}D ${getCheckIcon(p.periodMatch)}P`;

      console.log(
        '  ' +
          pad(icon, 2) +
          ' ' +
          pad(p.name, 24) +
          ' │ ' +
          pad(gtDoseStr, 10, 'right') +
          ' │ ' +
          pad(llmDoseStr, 10, 'right') +
          ' │ ' +
          pad(doseDiff, 8, 'right') +
          ' │ ' +
          pad(appsStr, 7, 'center') +
          ' │ ' +
          pad(gtPeriod, 15, 'center') +
          ' │ ' +
          pad(llmPeriod, 15, 'center') +
          ' │ ' +
          pad(dateDiff, 7, 'right') +
          ' │ ' +
          pad(checks, 9, 'center'),
      );
    }

    console.log('');
  }

  // Summary finale
  console.log(LINE);
  console.log('  📈 RIEPILOGO FINALE');
  console.log(THIN_LINE);

  // Calcola statistiche aggregate
  let totalAppsMatch = 0;
  let totalDoseMatch = 0;
  let totalPeriodMatch = 0;
  let totalProducts = 0;

  for (const unit of report.units) {
    for (const p of unit.productTotals) {
      totalProducts++;
      if (p.applicationCountMatch) totalAppsMatch++;
      if (p.doseMatch) totalDoseMatch++;
      if (p.periodMatch) totalPeriodMatch++;
    }
  }

  console.log(
    `  ✓ Applicazioni match: ${totalAppsMatch}/${totalProducts} (${((totalAppsMatch / totalProducts) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  ✓ Dosaggi match:      ${totalDoseMatch}/${totalProducts} (${((totalDoseMatch / totalProducts) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  ✓ Periodi match:      ${totalPeriodMatch}/${totalProducts} (${((totalPeriodMatch / totalProducts) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  ✓ Match completi:     ${report.totalMatchedTreatments}/${report.totalGroundTruthTreatments} (${(report.overallMatchRate * 100).toFixed(1)}%)`,
  );
  console.log(LINE + '\n');

  // Tabella riassuntiva discostamenti
  printDiscrepancyTable(report);
}

function printDiscrepancyTable(report: Match2Report): void {
  console.log('\n  ⚠️  DISCREPANZE SIGNIFICATIVE (Δ Dose > ±30% o Δ Periodo > 30gg)');
  console.log('  ' + '─'.repeat(110));

  const discrepancies: Array<{
    unit: string;
    crop: string;
    product: string;
    gtDose: number;
    llmDose: number;
    doseDiffPct: number;
    dateDiffDays: number | null;
    gtPeriod: string;
    llmPeriod: string;
  }> = [];

  for (const unit of report.units) {
    for (const p of unit.productTotals) {
      const gtDose = p.groundTruthAverageDose;
      const llmDose = p.llmAverageDose;
      const doseDiffPct =
        gtDose > 0 ? Math.abs((llmDose - gtDose) / gtDose) * 100 : llmDose > 0 ? 100 : 0;

      const gtMid = p.groundTruthPeriodStart || p.groundTruthPeriodEnd;
      const llmMid = p.llmPeriodStart || p.llmPeriodEnd;
      const dateDiffDays = daysBetweenDates(gtMid, llmMid);

      // Solo discrepanze significative
      if (doseDiffPct > 30 || (dateDiffDays !== null && dateDiffDays > 30)) {
        discrepancies.push({
          unit: unit.unitProductionId,
          crop: unit.cropName,
          product: p.name,
          gtDose,
          llmDose,
          doseDiffPct,
          dateDiffDays,
          gtPeriod: formatDateRange(p.groundTruthPeriodStart, p.groundTruthPeriodEnd),
          llmPeriod: formatDateRange(p.llmPeriodStart, p.llmPeriodEnd),
        });
      }
    }
  }

  if (discrepancies.length === 0) {
    console.log('  Nessuna discrepanza significativa trovata! 🎉\n');
    return;
  }

  // Header
  console.log(
    '  ' +
      pad('PRODOTTO', 22) +
      ' │ ' +
      pad('UNITÀ', 10) +
      ' │ ' +
      pad('DOSE GT', 9, 'right') +
      ' │ ' +
      pad('DOSE LLM', 9, 'right') +
      ' │ ' +
      pad('Δ%', 6, 'right') +
      ' │ ' +
      pad('PERIODO GT', 13, 'center') +
      ' │ ' +
      pad('PERIODO LLM', 13, 'center') +
      ' │ ' +
      pad('Δ GG', 6, 'right'),
  );
  console.log(
    '  ' +
      '─'.repeat(22) +
      '─┼─' +
      '─'.repeat(10) +
      '─┼─' +
      '─'.repeat(9) +
      '─┼─' +
      '─'.repeat(9) +
      '─┼─' +
      '─'.repeat(6) +
      '─┼─' +
      '─'.repeat(13) +
      '─┼─' +
      '─'.repeat(13) +
      '─┼─' +
      '─'.repeat(6),
  );

  // Ordina per delta dose decrescente
  discrepancies.sort((a, b) => b.doseDiffPct - a.doseDiffPct);

  for (const d of discrepancies) {
    const doseIcon = d.doseDiffPct > 30 ? '🔴' : '  ';
    const dateIcon = d.dateDiffDays !== null && d.dateDiffDays > 30 ? '🟠' : '  ';
    const deltaPct =
      d.doseDiffPct > 0 ? `${d.llmDose > d.gtDose ? '+' : '-'}${d.doseDiffPct.toFixed(0)}%` : '0%';
    const deltaDays = d.dateDiffDays !== null ? `${d.dateDiffDays}` : '—';

    console.log(
      '  ' +
        pad(d.product, 22) +
        ' │ ' +
        pad(d.unit, 10) +
        ' │ ' +
        pad(d.gtDose.toFixed(2), 9, 'right') +
        ' │ ' +
        pad(d.llmDose.toFixed(2), 9, 'right') +
        ' │ ' +
        doseIcon +
        pad(deltaPct, 4, 'right') +
        ' │ ' +
        pad(d.gtPeriod, 13, 'center') +
        ' │ ' +
        pad(d.llmPeriod, 13, 'center') +
        ' │ ' +
        dateIcon +
        pad(deltaDays, 4, 'right'),
    );
  }

  console.log('  ' + '─'.repeat(110));
  console.log(`  Totale discrepanze: ${discrepancies.length}`);
  console.log('  🔴 = Δ Dose > 30%   🟠 = Δ Periodo > 30 giorni\n');
}
