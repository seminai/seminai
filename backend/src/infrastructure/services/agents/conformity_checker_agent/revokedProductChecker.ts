import {
  checkProductsBatchRevoked,
  buildRevokedExclusionMessage,
  getRevokedDatasetWarning,
} from '../dosage_agent/revokedProductChecker';
import type { ConformityViolation, JobWithRelations } from './types';

/**
 * Checks all products in the job list against the ministry revocation dataset.
 * Synchronous lookup (cached in memory), no LLM calls needed.
 *
 * Returns a Map of violations keyed by "regNumber|productName" and an optional system warning
 * if the revoked dataset is not available.
 */
export function checkRevokedProducts(jobs: JobWithRelations[]): {
  violations: Map<string, ConformityViolation>;
  systemWarning: string | null;
} {
  const violations = new Map<string, ConformityViolation>();

  // Check dataset availability first
  const datasetWarning = getRevokedDatasetWarning();

  // Collect unique products
  const uniqueProducts: Array<{ regNumber: string; name: string }> = [];
  const seen = new Set<string>();

  for (const job of jobs) {
    const product = job.stocks[0]?.product;
    if (!product) continue;

    const regNumber = product.registrationNumber ?? '';
    const name = product.name ?? '';
    const key = `${regNumber}|${name}`;

    if (seen.has(key)) continue;
    seen.add(key);

    uniqueProducts.push({ regNumber, name });
  }

  if (uniqueProducts.length === 0) {
    return { violations, systemWarning: datasetWarning };
  }

  // Batch check against revoked dataset
  const revokeResults = checkProductsBatchRevoked(uniqueProducts);

  for (const [key, result] of revokeResults.entries()) {
    if (result.isRevoked && result.info) {
      const message = buildRevokedExclusionMessage(result.info);
      violations.set(key, {
        type: 'PRODUCT_REVOKED',
        message,
        severity: 'ERROR',
        source: 'MINISTERIAL_DATASET',
        field: 'product_status',
        currentValue: result.info.revokeDate ?? 'revocato',
      });
    }
  }

  return { violations, systemWarning: datasetWarning };
}
