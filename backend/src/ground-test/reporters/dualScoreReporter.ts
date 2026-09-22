import type { ValidationResult } from '../evaluators/types';

export interface DualScoreReport {
  units: {
    unitId: string;
    products: ValidationResult[];
  }[];
  summary: {
    totalProducts: number;
    legalComplianceRate: number; // %
    plausibilityRate: number; // % (verdict EXACT o PLAUSIBLE)
    exactMatchRate: number; // % (verdict EXACT)
    plausibilityVerdicts: {
      exact: number;
      plausible: number;
      differentStrategy: number;
      wrong: number;
      noMatch: number;
    };
  };
}

export function generateDualScoreReport(results: ValidationResult[]): DualScoreReport {
  const totalProducts = results.length;
  if (totalProducts === 0) {
    return {
      units: [],
      summary: {
        totalProducts: 0,
        legalComplianceRate: 0,
        plausibilityRate: 0,
        exactMatchRate: 0,
        plausibilityVerdicts: {
          exact: 0,
          plausible: 0,
          differentStrategy: 0,
          wrong: 0,
          noMatch: 0,
        },
      },
    };
  }

  const legalCount = results.filter((r) => r.compliance.isCompliant).length;

  // Breakdown verdicts
  const verdicts = {
    exact: 0,
    plausible: 0,
    differentStrategy: 0,
    wrong: 0,
    noMatch: 0,
  };

  for (const r of results) {
    switch (r.plausibility.verdict) {
      case 'EXACT':
        verdicts.exact++;
        break;
      case 'PLAUSIBLE':
        verdicts.plausible++;
        break;
      case 'DIFFERENT_STRATEGY':
        verdicts.differentStrategy++;
        break;
      case 'WRONG':
        verdicts.wrong++;
        break;
      case 'NO_MATCH':
        verdicts.noMatch++;
        break;
    }
  }

  const plausibleCount = verdicts.exact + verdicts.plausible;
  const exactCount = verdicts.exact;

  // Raggruppa per unità
  const unitsMap = new Map<string, ValidationResult[]>();
  for (const r of results) {
    if (!unitsMap.has(r.unitId)) {
      unitsMap.set(r.unitId, []);
    }
    unitsMap.get(r.unitId)!.push(r);
  }

  const units = Array.from(unitsMap.entries()).map(([unitId, products]) => ({
    unitId,
    products,
  }));

  return {
    units,
    summary: {
      totalProducts,
      legalComplianceRate: (legalCount / totalProducts) * 100,
      plausibilityRate: (plausibleCount / totalProducts) * 100,
      exactMatchRate: (exactCount / totalProducts) * 100,
      plausibilityVerdicts: verdicts,
    },
  };
}

export function printDualScoreReport(report: DualScoreReport) {
  console.log('\n════════════════════════════════════════════════════════════════════════════');
  console.log('  DUAL SCORE VALIDATION REPORT');
  console.log('════════════════════════════════════════════════════════════════════════════\n');

  for (const unit of report.units) {
    console.log(`🏠 UNIT: ${unit.unitId}`);
    console.log(`   Products: ${unit.products.length}`);

    for (const p of unit.products) {
      const legalIcon = p.compliance.isCompliant ? '✅' : '❌';
      const plausIcon =
        p.plausibility.verdict === 'EXACT'
          ? '🎯'
          : p.plausibility.verdict === 'PLAUSIBLE'
            ? '🆗'
            : p.plausibility.verdict === 'DIFFERENT_STRATEGY'
              ? '🔄'
              : '⚠️';

      console.log(`   📦 ${p.productName} (${p.regNumber})`);
      console.log(
        `      LEGAL: ${legalIcon} ${p.compliance.isCompliant ? 'COMPLIANT' : 'VIOLATION'} ${p.compliance.violations.length > 0 ? `[${p.compliance.violations.join(', ')}]` : ''}`,
      );
      console.log(
        `      HISTO: ${plausIcon} ${p.plausibility.verdict} (Score: ${p.plausibility.score}%)`,
      );
      if (p.plausibility.details) {
        console.log(`             ${p.plausibility.details}`);
      }
      console.log('');
    }
    console.log('───');
  }

  console.log('\n════════════════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY STATISTICS');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log(`  Total Products Evaluated: ${report.summary.totalProducts}`);
  console.log(`  ⚖️  LEGAL COMPLIANCE:     ${report.summary.legalComplianceRate.toFixed(1)}%`);
  console.log(`  📚 HISTORIC PLAUSIBILITY: ${report.summary.plausibilityRate.toFixed(1)}%`);
  console.log(`  🎯 EXACT HISTORIC MATCH:  ${report.summary.exactMatchRate.toFixed(1)}%`);
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('  Verdicts Breakdown:');
  console.log(`  🎯 EXACT:              ${report.summary.plausibilityVerdicts.exact}`);
  console.log(`  🆗 PLAUSIBLE:          ${report.summary.plausibilityVerdicts.plausible}`);
  console.log(`  🔄 DIFFERENT STRATEGY: ${report.summary.plausibilityVerdicts.differentStrategy}`);
  console.log(`  ⚠️ WRONG:              ${report.summary.plausibilityVerdicts.wrong}`);
  console.log(`  ❓ NO MATCH:           ${report.summary.plausibilityVerdicts.noMatch}`);
  console.log('════════════════════════════════════════════════════════════════════════════\n');
}
