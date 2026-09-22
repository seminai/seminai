import type {
  AgronomicConstrainedProduct,
  AgronomicConstrainedTreatment,
  AgronomicConstrainedUnit,
  AgronomicFinding,
  AgronomicPlanInput,
  AgronomicValidationPolicy,
} from './agronomic-violation.types';
import { DEFAULT_MIN_DOSE_ROW_CONFIDENCE } from './agronomic-violation.types';
import { buildFinding } from './finding-helpers';

/** Relative tolerance for float comparisons (0.1%). */
const DOSE_TOLERANCE = 1.001;

/**
 * Validates each treatment's computed dose against the resolved label range.
 * - Below the dose-row confidence threshold → DOSE_ROW_UNRESOLVED (fail-closed).
 * - Above the label max → DOSE_ABOVE_LABEL_MAX.
 * - Below the label min → DOSE_BELOW_LABEL_MIN.
 */
export function validateDoseMax(
  plan: AgronomicPlanInput,
  policy?: AgronomicValidationPolicy,
): AgronomicFinding[] {
  const minConfidence = policy?.minDoseRowConfidence ?? DEFAULT_MIN_DOSE_ROW_CONFIDENCE;
  return plan.units.flatMap((unit) =>
    unit.products.flatMap((product) =>
      product.treatments.flatMap((treatment) =>
        doseFindings(unit, product, treatment, minConfidence),
      ),
    ),
  );
}

function doseFindings(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
  treatment: AgronomicConstrainedTreatment,
  minConfidence: number,
): AgronomicFinding[] {
  if (product.isRevoked || treatment.doseValue === null) {
    return [];
  }
  if (treatment.doseRowConfidence < minConfidence) {
    return [unresolvedFinding(unit, product, treatment)];
  }
  const findings: AgronomicFinding[] = [];
  const { doseValue, labelDoseMax, labelDoseMin, doseUnit } = treatment;
  if (labelDoseMax !== null && doseValue > labelDoseMax * DOSE_TOLERANCE) {
    findings.push(aboveMaxFinding(unit, product, doseValue, labelDoseMax, doseUnit));
  }
  if (labelDoseMin !== null && doseValue < labelDoseMin / DOSE_TOLERANCE) {
    findings.push(belowMinFinding(unit, product, doseValue, labelDoseMin, doseUnit));
  }
  return findings;
}

function unresolvedFinding(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
  treatment: AgronomicConstrainedTreatment,
): AgronomicFinding {
  return buildFinding({
    code: 'DOSE_ROW_UNRESOLVED',
    unit,
    product,
    source: 'label',
    observed: treatment.doseValue,
    message:
      `Impossibile abbinare con certezza la riga di dosaggio dell'etichetta per ${product.productName} ` +
      `su ${unit.cropName} (confidenza ${treatment.doseRowConfidence.toFixed(2)}). ` +
      `Dose non verificabile contro il massimo di etichetta: chiedere conferma all'utente.`,
  });
}

function aboveMaxFinding(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
  dose: number,
  max: number,
  unitLabel: string | null,
): AgronomicFinding {
  const um = unitLabel ?? '';
  return buildFinding({
    code: 'DOSE_ABOVE_LABEL_MAX',
    unit,
    product,
    source: 'label',
    observed: dose,
    limit: max,
    message:
      `Dose ${dose} ${um} per ${product.productName} su ${unit.cropName} ` +
      `supera la dose massima autorizzata da etichetta (${max} ${um}).`,
  });
}

function belowMinFinding(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
  dose: number,
  min: number,
  unitLabel: string | null,
): AgronomicFinding {
  const um = unitLabel ?? '';
  return buildFinding({
    code: 'DOSE_BELOW_LABEL_MIN',
    unit,
    product,
    source: 'label',
    observed: dose,
    limit: min,
    message:
      `Dose ${dose} ${um} per ${product.productName} su ${unit.cropName} ` +
      `è inferiore alla dose minima di etichetta (${min} ${um}): possibile sotto-efficacia.`,
  });
}
