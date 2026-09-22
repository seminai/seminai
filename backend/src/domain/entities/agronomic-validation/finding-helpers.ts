import type {
  AgronomicConstrainedProduct,
  AgronomicConstrainedUnit,
  AgronomicFinding,
  AgronomicViolationCode,
  AgronomicViolationSource,
} from './agronomic-violation.types';

interface BuildFindingParams {
  readonly code: AgronomicViolationCode;
  readonly unit: AgronomicConstrainedUnit;
  readonly product: AgronomicConstrainedProduct;
  readonly message: string;
  readonly source: AgronomicViolationSource;
  readonly observed?: number | string | null;
  readonly limit?: number | string | null;
}

/**
 * Builds an AgronomicFinding from a unit/product pair, filling the shared
 * identification fields so each validator stays focused on its own logic.
 */
export function buildFinding(params: BuildFindingParams): AgronomicFinding {
  return {
    code: params.code,
    productionUnitId: params.unit.productionUnitId,
    productName: params.product.productName,
    registrationNumber: params.product.registrationNumber,
    cropName: params.unit.cropName,
    adversity: params.unit.adversity,
    message: params.message,
    observed: params.observed ?? null,
    limit: params.limit ?? null,
    source: params.source,
  };
}
