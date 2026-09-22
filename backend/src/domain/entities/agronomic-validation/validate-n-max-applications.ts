import type {
  AgronomicConstrainedProduct,
  AgronomicConstrainedUnit,
  AgronomicFinding,
  AgronomicPlanInput,
} from './agronomic-violation.types';
import { buildFinding } from './finding-helpers';

/**
 * Validates the number of planned applications against the label cap
 * (n_max_applicazioni) of the resolved dose rows. Uses the most restrictive
 * resolved cap, so a product registered for more applications against a
 * different disease does not mask an over-application on this crop+target.
 */
export function validateNMaxApplications(plan: AgronomicPlanInput): AgronomicFinding[] {
  return plan.units.flatMap((unit) =>
    unit.products.flatMap((product) => (product.isRevoked ? [] : nMaxFindings(unit, product))),
  );
}

function nMaxFindings(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
): AgronomicFinding[] {
  const caps = product.treatments
    .map((t) => t.labelNMaxApplications)
    .filter((n): n is number => n !== null && n > 0);
  if (caps.length === 0) return [];
  const cap = Math.min(...caps);
  const count = product.treatments.length;
  if (count <= cap) return [];
  const scope =
    product.treatments.find((t) => t.labelNMaxApplicationsUm)?.labelNMaxApplicationsUm ??
    'per ciclo';
  return [
    buildFinding({
      code: 'N_MAX_APPLICATIONS_EXCEEDED',
      unit,
      product,
      source: 'label',
      observed: count,
      limit: cap,
      message:
        `${count} applicazioni di ${product.productName} su ${unit.cropName} superano ` +
        `il numero massimo autorizzato da etichetta (${cap} ${scope}).`,
    }),
  ];
}
