import type {
  AgronomicConstrainedProduct,
  AgronomicConstrainedUnit,
  AgronomicFinding,
  AgronomicPlanInput,
} from './agronomic-violation.types';
import { buildFinding } from './finding-helpers';

/** A metric distance (e.g. "10 m", "20m") signals a real safety buffer. */
const METRIC_DISTANCE = /\d+\s*m\b/i;

/**
 * Flags products whose label declares a metric buffer zone (fasce di rispetto
 * da acqua/colture) when no buffer-area reduction was applied upstream, so the
 * user verifies the treated area excludes the required safety distance.
 */
export function validateBufferZones(plan: AgronomicPlanInput): AgronomicFinding[] {
  return plan.units.flatMap((unit) =>
    unit.products.flatMap((product) => bufferFindings(unit, product)),
  );
}

function bufferFindings(
  unit: AgronomicConstrainedUnit,
  product: AgronomicConstrainedProduct,
): AgronomicFinding[] {
  if (product.isRevoked || product.bufferAreaApplied) return [];
  const zones = [product.fasceRispettoAcqua, product.fasceRispettoColture].filter(
    (zone): zone is string => !!zone && METRIC_DISTANCE.test(zone),
  );
  if (zones.length === 0) return [];
  return [
    buildFinding({
      code: 'BUFFER_ZONE_NOT_APPLIED',
      unit,
      product,
      source: 'label',
      observed: zones.join(' | '),
      message:
        `${product.productName}: l'etichetta prescrive fasce di rispetto (${zones.join('; ')}). ` +
        "Verificare che l'area trattata escluda tali distanze di sicurezza.",
    }),
  ];
}
