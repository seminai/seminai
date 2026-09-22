import type {
  AgronomicConstrainedProduct,
  AgronomicConstrainedTreatment,
  AgronomicConstrainedUnit,
  AgronomicFinding,
  AgronomicPlanInput,
} from './agronomic-violation.types';
import { buildFinding } from './finding-helpers';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Epoca markers that denote a POST-harvest application. For these the
 * pre-harvest interval (carenza/PHI) does not apply, so the check is skipped.
 * Kept in sync with the prompt guidance in treatmentDatePlanner.ts.
 */
const POST_HARVEST_MARKERS: ReadonlyArray<string> = [
  'post-raccolta',
  'postraccolta',
  'post raccolta',
  'dopo il raccolto',
  'dopo raccolta',
  'dopo la raccolta',
  'fine ciclo',
];

/**
 * Validates that no treatment is applied later than (harvest − PHI days).
 * Skips units without a harvest date and treatments flagged as post-harvest.
 */
export function validatePhi(plan: AgronomicPlanInput): AgronomicFinding[] {
  return plan.units.flatMap((unit) => {
    const harvestMs = parseDateMs(unit.harvestingDate);
    if (harvestMs === null) return [];
    return unit.products.flatMap((product) =>
      product.treatments.flatMap((treatment) => phiFindings(unit, product, treatment, harvestMs)),
    );
  });
}

function phiFindings(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
  treatment: AgronomicConstrainedTreatment,
  harvestMs: number,
): AgronomicFinding[] {
  if (product.isRevoked || treatment.labelPhiDays === null) return [];
  if (isPostHarvest(treatment.epoca)) return [];
  const applicationMs = parseDateMs(treatment.applicationDate);
  if (applicationMs === null) return [];
  const latestAllowedMs = harvestMs - treatment.labelPhiDays * MS_PER_DAY;
  if (applicationMs <= latestAllowedMs) return [];
  return [phiViolation(unit, product, treatment, latestAllowedMs)];
}

function phiViolation(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
  treatment: AgronomicConstrainedTreatment,
  latestAllowedMs: number,
): AgronomicFinding {
  const latest = toIsoDate(latestAllowedMs);
  const applied = treatment.applicationDate ? treatment.applicationDate.slice(0, 10) : '';
  return buildFinding({
    code: 'PHI_VIOLATION',
    unit,
    product,
    source: 'label',
    observed: applied,
    limit: latest,
    message:
      `Trattamento ${product.productName} su ${unit.cropName} previsto il ${applied} ` +
      `viola il tempo di carenza (${treatment.labelPhiDays} gg): ultima data utile ${latest}.`,
  });
}

function isPostHarvest(epoca: string | null): boolean {
  if (!epoca) return false;
  const normalized = epoca.toLowerCase();
  return POST_HARVEST_MARKERS.some((marker) => normalized.includes(marker));
}

function parseDateMs(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
