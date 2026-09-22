import { Match2Report } from './match_2.part-01-dataset-unit-treatment-item';
import { calcDateOffset, calcDoseDiff, formatDateRange, getCheckIcon, getStatusIcon, pad } from './match_2.part-02-build-match2-report';
import { printDiscrepancyTable } from './match_2.part-04-print-discrepancy-table';

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
