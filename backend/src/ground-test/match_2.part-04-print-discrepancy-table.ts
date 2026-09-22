import { Match2Report } from './match_2.part-01-dataset-unit-treatment-item';
import { daysBetweenDates, formatDateRange, pad } from './match_2.part-02-build-match2-report';

export function printDiscrepancyTable(report: Match2Report): void {
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
