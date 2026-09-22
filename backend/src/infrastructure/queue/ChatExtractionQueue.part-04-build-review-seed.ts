import type { StockPreviewEntry } from '../services/agents/dosage_agent_react/tools/file-extraction-types';
import { DocumentCategory } from '@prisma/client';

/**
 * Builds the seed payload for present_extraction_review from extracted stock entries.
 * Maps the legacy stock-shaped extraction into the per-category review schema (FATTURA/DDT).
 */
export function buildReviewSeed(
  stockEntries: readonly StockPreviewEntry[],
  documentCategory: DocumentCategory,
): Record<string, unknown> {
  const first = stockEntries[0];
  if (!first) return {};
  const supplier = first.stock.companySupplierName ?? '';
  const totalLines = stockEntries.length;
  if (documentCategory === 'DDT') {
    return {
      ddtNumber: first.stock.ddtCode ?? '',
      ddtDate: first.stock.ddtDate ?? '',
      supplierName: supplier,
      totalLines,
    };
  }
  if (documentCategory === 'FATTURA') {
    return {
      invoiceNumber: first.stock.invoiceCode ?? first.stock.ddtCode ?? '',
      invoiceDate: first.stock.ddtDate ?? '',
      supplierName: supplier,
      totalLines,
    };
  }
  return {};
}
