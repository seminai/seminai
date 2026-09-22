import { Label, LabelDoseDetail } from '../../domain/dtos/label.dto';

export interface LabelDosageCheckInput {
  readonly productName: string;
  readonly regNumber: string;
  readonly cropName: string;
  readonly label?: Label;
  readonly treatments: ReadonlyArray<{
    readonly dose?: number;
    readonly dosaggio_um?: string;
    readonly data_distribuzione?: Date;
    readonly epoca_impiego?: string;
  }>;
  readonly harvestDate?: Date;
}

export interface DoseViolation {
  readonly type:
    | 'DOSE_BELOW_MIN'
    | 'DOSE_ABOVE_MAX'
    | 'TOO_MANY_APPLICATIONS'
    | 'INTERVAL_TOO_SHORT'
    | 'PHI_VIOLATED';
  readonly message: string;
  readonly treatmentIndex?: number;
  readonly actual?: number;
  readonly limit?: number;
}

export interface LabelDosageResult {
  readonly isCompliant: boolean;
  readonly score: number; // 0-100
  readonly violations: ReadonlyArray<DoseViolation>;
  readonly details: {
    readonly totalTreatments: number;
    readonly treatmentsInRange: number;
    readonly labelFound: boolean;
    readonly dosageDetailFound: boolean;
    readonly doseRange?: { min: number; max: number; unit: string };
    readonly maxApplications?: number;
    readonly minInterval?: number;
    readonly phi?: number;
  };
}

function findDosageDetailForCrop(label: Label, cropName: string): LabelDoseDetail | null {
  const dosaggi = label.dosaggi_dettagliati || [];
  if (dosaggi.length === 0) return null;

  const normalizedCrop = cropName.toLowerCase();

  // Try exact match first
  const exactMatch = dosaggi.find((d) => d.coltura.toLowerCase() === normalizedCrop);
  if (exactMatch) return exactMatch;

  // Try partial match
  const partialMatch = dosaggi.find(
    (d) =>
      d.coltura.toLowerCase().includes(normalizedCrop) ||
      normalizedCrop.includes(d.coltura.toLowerCase()),
  );
  if (partialMatch) return partialMatch;

  // Return first if no match (generic)
  return dosaggi[0];
}

function isDoseInRange(
  dose: number,
  doseMin: number | null | undefined,
  doseMax: number | null | undefined,
  tolerance: number = 0.1, // 10% tolerance
): { inRange: boolean; belowMin: boolean; aboveMax: boolean } {
  const effectiveMin = doseMin ?? 0;
  const effectiveMax = doseMax ?? Infinity;

  const minWithTolerance = effectiveMin * (1 - tolerance);
  const maxWithTolerance = effectiveMax * (1 + tolerance);

  return {
    inRange: dose >= minWithTolerance && dose <= maxWithTolerance,
    belowMin: dose < minWithTolerance,
    aboveMax: dose > maxWithTolerance,
  };
}

function daysBetween(date1: Date, date2: Date): number {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function evaluateLabelDosage(input: LabelDosageCheckInput): LabelDosageResult {
  const violations: DoseViolation[] = [];
  const treatments = input.treatments || [];

  // No treatments = nothing to evaluate
  if (treatments.length === 0) {
    return {
      isCompliant: true,
      score: 100,
      violations: [],
      details: {
        totalTreatments: 0,
        treatmentsInRange: 0,
        labelFound: !!input.label,
        dosageDetailFound: false,
      },
    };
  }

  // No label = can't evaluate against label
  if (!input.label) {
    return {
      isCompliant: true, // Can't verify without label
      score: 50, // Partial score - unknown compliance
      violations: [],
      details: {
        totalTreatments: treatments.length,
        treatmentsInRange: 0,
        labelFound: false,
        dosageDetailFound: false,
      },
    };
  }

  const dosageDetail = findDosageDetailForCrop(input.label, input.cropName);

  if (!dosageDetail) {
    return {
      isCompliant: true, // Can't verify without dosage details
      score: 50,
      violations: [],
      details: {
        totalTreatments: treatments.length,
        treatmentsInRange: 0,
        labelFound: true,
        dosageDetailFound: false,
      },
    };
  }

  const doseMin = dosageDetail.dose_minima ?? null;
  const doseMax = dosageDetail.dose_massima ?? null;
  const doseUnit = dosageDetail.dose_um || '';
  const maxApplications = dosageDetail.n_max_applicazioni ?? null;
  const minInterval = dosageDetail.intervallo_min_giorni ?? null;
  const phi = dosageDetail.intervallo_sicurezza_giorni ?? null;

  let treatmentsInRange = 0;
  // Check each treatment dose
  treatments.forEach((t, index) => {
    if (typeof t.dose !== 'number') return;
    const { inRange, belowMin, aboveMax } = isDoseInRange(t.dose, doseMin, doseMax);
    if (inRange) {
      treatmentsInRange++;
    } else if (belowMin && doseMin !== null) {
      violations.push({
        type: 'DOSE_BELOW_MIN',
        message: `Trattamento #${index + 1}: dose ${t.dose} ${t.dosaggio_um || ''} < min ${doseMin} ${doseUnit}`,
        treatmentIndex: index,
        actual: t.dose,
        limit: doseMin,
      });
    } else if (aboveMax && doseMax !== null) {
      violations.push({
        type: 'DOSE_ABOVE_MAX',
        message: `Trattamento #${index + 1}: dose ${t.dose} ${t.dosaggio_um || ''} > max ${doseMax} ${doseUnit}`,
        treatmentIndex: index,
        actual: t.dose,
        limit: doseMax,
      });
    }
  });
  // Check number of applications
  if (maxApplications !== null && treatments.length > maxApplications) {
    violations.push({
      type: 'TOO_MANY_APPLICATIONS',
      message: `Numero applicazioni ${treatments.length} > max consentito ${maxApplications}`,
      actual: treatments.length,
      limit: maxApplications,
    });
  }
  // Check interval between applications
  if (minInterval !== null && treatments.length > 1) {
    const sortedTreatments = [...treatments]
      .filter((t) => t.data_distribuzione)
      .sort((a, b) => a.data_distribuzione!.getTime() - b.data_distribuzione!.getTime());
    for (let i = 1; i < sortedTreatments.length; i++) {
      const prev = sortedTreatments[i - 1];
      const curr = sortedTreatments[i];
      const daysDiff = daysBetween(prev.data_distribuzione!, curr.data_distribuzione!);
      if (daysDiff < minInterval) {
        violations.push({
          type: 'INTERVAL_TOO_SHORT',
          message: `Intervallo tra trattamento #${i} e #${i + 1}: ${daysDiff} giorni < min ${minInterval} giorni`,
          treatmentIndex: i,
          actual: daysDiff,
          limit: minInterval,
        });
      }
    }
  }
  // Check PHI (Pre-Harvest Interval)
  if (phi !== null && input.harvestDate) {
    const lastTreatment = [...treatments]
      .filter((t) => t.data_distribuzione)
      .sort((a, b) => b.data_distribuzione!.getTime() - a.data_distribuzione!.getTime())[0];
    if (lastTreatment?.data_distribuzione) {
      const daysToHarvest = daysBetween(lastTreatment.data_distribuzione, input.harvestDate);
      if (daysToHarvest < phi) {
        violations.push({
          type: 'PHI_VIOLATED',
          message: `Ultimo trattamento a ${daysToHarvest} giorni dalla raccolta < PHI ${phi} giorni`,
          actual: daysToHarvest,
          limit: phi,
        });
      }
    }
  }
  // Calculate score
  const treatmentsWithDose = treatments.filter((t) => typeof t.dose === 'number').length;
  const doseScore = treatmentsWithDose > 0 ? (treatmentsInRange / treatmentsWithDose) * 100 : 100;
  const applicationScore =
    maxApplications !== null && treatments.length > maxApplications ? 0 : 100;
  const intervalViolations = violations.filter((v) => v.type === 'INTERVAL_TOO_SHORT').length;
  const intervalScore =
    treatments.length > 1 && minInterval !== null
      ? ((treatments.length - 1 - intervalViolations) / (treatments.length - 1)) * 100
      : 100;
  const phiScore = violations.some((v) => v.type === 'PHI_VIOLATED') ? 0 : 100;
  // Weighted average
  const finalScore = Math.round(
    doseScore * 0.5 + // 50% weight on dose compliance
      applicationScore * 0.25 + // 25% weight on application count
      intervalScore * 0.15 + // 15% weight on intervals
      phiScore * 0.1, // 10% weight on PHI
  );
  return {
    isCompliant: violations.length === 0,
    score: finalScore,
    violations,
    details: {
      totalTreatments: treatments.length,
      treatmentsInRange,
      labelFound: true,
      dosageDetailFound: true,
      doseRange:
        doseMin !== null || doseMax !== null
          ? { min: doseMin ?? 0, max: doseMax ?? Infinity, unit: doseUnit }
          : undefined,
      maxApplications: maxApplications ?? undefined,
      minInterval: minInterval ?? undefined,
      phi: phi ?? undefined,
    },
  };
}
export function printLabelDosageReport(
  results: ReadonlyArray<{
    unitId: string;
    productName: string;
    result: LabelDosageResult;
  }>,
): void {
  console.log('\n[LABEL-DOSAGE] ═══════════════════════════════════════════════════════════');
  console.log('[LABEL-DOSAGE] REPORT COMPLIANCE DOSAGGI vs ETICHETTA');
  console.log('[LABEL-DOSAGE] ═══════════════════════════════════════════════════════════\n');
  let totalCompliant = 0;
  let totalProducts = 0;
  let totalScore = 0;
  for (const r of results) {
    if (!r.result.details.labelFound || !r.result.details.dosageDetailFound) continue;
    totalProducts++;
    totalScore += r.result.score;
    if (r.result.isCompliant) totalCompliant++;
    const icon = r.result.isCompliant ? '✅' : '❌';
    const range = r.result.details.doseRange
      ? `[${r.result.details.doseRange.min}-${r.result.details.doseRange.max}] ${r.result.details.doseRange.unit}`
      : 'N/A';
    console.log(`${icon} ${r.productName} (${r.unitId})`);
    console.log(`   Score: ${r.result.score}% | Range etichetta: ${range}`);
    console.log(
      `   Trattamenti: ${r.result.details.treatmentsInRange}/${r.result.details.totalTreatments} nel range`,
    );
    if (r.result.violations.length > 0) {
      console.log('   Violazioni:');
      for (const v of r.result.violations) {
        console.log(`     - ${v.message}`);
      }
    }
    console.log('');
  }
  if (totalProducts > 0) {
    console.log('[LABEL-DOSAGE] ───────────────────────────────────────────────────────────');
    console.log(
      `[LABEL-DOSAGE] Prodotti compliant: ${totalCompliant}/${totalProducts} (${((totalCompliant / totalProducts) * 100).toFixed(1)}%)`,
    );
    console.log(`[LABEL-DOSAGE] Score medio: ${(totalScore / totalProducts).toFixed(1)}%`);
    console.log('[LABEL-DOSAGE] ═══════════════════════════════════════════════════════════\n');
  }
}
