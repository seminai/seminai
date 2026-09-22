import type { AgronomicFinding, AgronomicPlanInput } from './agronomic-violation.types';
import { buildFinding } from './finding-helpers';

const DEFAULT_REVOKED_MESSAGE =
  "Prodotto revocato dal Ministero della Salute: non più autorizzato per l'uso.";

/**
 * Flags any product in the plan that the ministerial dataset marks as revoked.
 * Acts as a backstop: revoked products should already be excluded upstream.
 */
export function validateRevoked(plan: AgronomicPlanInput): AgronomicFinding[] {
  return plan.units.flatMap((unit) =>
    unit.products
      .filter((product) => product.isRevoked)
      .map((product) =>
        buildFinding({
          code: 'REVOKED_PRODUCT',
          unit,
          product,
          source: 'ministerial',
          message: `${product.productName}: ${product.revokedReason ?? DEFAULT_REVOKED_MESSAGE}`,
        }),
      ),
  );
}
