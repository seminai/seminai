import type {
  AgronomicConstrainedProduct,
  AgronomicConstrainedUnit,
  AgronomicFinding,
  AgronomicPlanInput,
} from './agronomic-violation.types';
import { buildFinding } from './finding-helpers';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DatedApplication {
  readonly ms: number;
  readonly minIntervalDays: number;
}

/**
 * Validates that consecutive applications of the same product respect the
 * label's minimum interval (intervallo_min_giorni).
 */
export function validateMinInterval(plan: AgronomicPlanInput): AgronomicFinding[] {
  return plan.units.flatMap((unit) =>
    unit.products.flatMap((product) => (product.isRevoked ? [] : intervalFindings(unit, product))),
  );
}

function intervalFindings(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
): AgronomicFinding[] {
  const dated = collectDatedApplications(product);
  const findings: AgronomicFinding[] = [];
  for (let i = 1; i < dated.length; i += 1) {
    const previous = dated[i - 1]!;
    const current = dated[i]!;
    const required = Math.max(previous.minIntervalDays, current.minIntervalDays);
    const gapDays = Math.round((current.ms - previous.ms) / MS_PER_DAY);
    if (gapDays < required) {
      findings.push(intervalViolation(unit, product, gapDays, required));
    }
  }
  return findings;
}

function collectDatedApplications(product: AgronomicConstrainedProduct): DatedApplication[] {
  return product.treatments
    .filter((t) => t.applicationDate !== null && t.labelMinIntervalDays !== null)
    .map((t) => ({ ms: Date.parse(t.applicationDate!), minIntervalDays: t.labelMinIntervalDays! }))
    .filter((t) => Number.isFinite(t.ms))
    .sort((a, b) => a.ms - b.ms);
}

function intervalViolation(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
  gapDays: number,
  required: number,
): AgronomicFinding {
  return buildFinding({
    code: 'MIN_INTERVAL_VIOLATION',
    unit,
    product,
    source: 'label',
    observed: gapDays,
    limit: required,
    message:
      `Due applicazioni di ${product.productName} su ${unit.cropName} distano ${gapDays} gg, ` +
      `sotto l'intervallo minimo di etichetta (${required} gg).`,
  });
}
