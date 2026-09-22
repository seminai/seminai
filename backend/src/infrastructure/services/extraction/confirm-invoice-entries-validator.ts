import { CompanyKind } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { type ConfirmableStockEntry } from '../../../domain/dtos/extraction-confirm-request.dto';
import { isValidExtractionProductCategory } from '../../../application/use-cases/extraction/resolve-extraction-product-category';
import { isRowCoherenceReviewReason, validateRowCoherence } from './row-validator';

interface ValidationInput {
  readonly entries: readonly ConfirmableStockEntry[];
  readonly allowReviewOverride: boolean;
  readonly companyKind?: CompanyKind;
}

/**
 * Guards invoice/DDT confirmation from persisting uncertain OCR rows as stock.
 */
export function assertConfirmableInvoiceEntries(input: ValidationInput): void {
  const errors = input.entries.flatMap((entry, index) =>
    validateEntry(
      entry,
      index + 1,
      input.allowReviewOverride,
      input.companyKind ?? CompanyKind.AGRICULTURAL,
    ),
  );
  if (errors.length === 0) return;
  throw AppError.badRequest(errors.join('; '), 'INVALID_INVOICE_ROWS');
}

function validateEntry(
  entry: ConfirmableStockEntry,
  rowNumber: number,
  allowReviewOverride: boolean,
  companyKind: CompanyKind,
): readonly string[] {
  const errors: string[] = [];
  if (!entry.productName.trim()) errors.push(`Row ${rowNumber}: productName is required`);
  if (!isValidExtractionProductCategory(entry.productCategory, companyKind)) {
    errors.push(`Row ${rowNumber}: productCategory is invalid`);
  }
  if (entry.quantity === null || !Number.isFinite(entry.quantity) || entry.quantity <= 0) {
    errors.push(`Row ${rowNumber}: quantity must be positive`);
  }
  if (!entry.quantityUnitOfMeasure?.trim()) {
    errors.push(`Row ${rowNumber}: quantityUnitOfMeasure is required`);
  }
  if (entry.totalPrice === null || entry.totalPrice === undefined) {
    if (!allowReviewOverride) errors.push(`Row ${rowNumber}: totalPrice is required`);
  } else if (!Number.isFinite(entry.totalPrice) || entry.totalPrice < 0) {
    errors.push(`Row ${rowNumber}: totalPrice is invalid`);
  }
  if (!allowReviewOverride) errors.push(...resolveReviewErrors(entry, rowNumber));
  return errors;
}

function resolveReviewErrors(entry: ConfirmableStockEntry, rowNumber: number): readonly string[] {
  const storedReasons = entry.reviewReasons ?? [];
  const unresolvedStoredReasons = storedReasons.filter(
    (reason) => !isRowCoherenceReviewReason(reason),
  );
  const currentVerdict = validateRowCoherence({
    quantity: entry.quantity,
    quantityUnitOfMeasure: entry.quantityUnitOfMeasure,
    unitPrice: entry.unitPrice ?? null,
    totalPrice: entry.totalPrice ?? null,
  });
  const currentReasons = currentVerdict.reasons.filter(
    (reason) => reason !== 'Missing quantity' && reason !== 'Non-positive quantity',
  );
  const hasUnspecifiedReview = entry.needsReview === true && storedReasons.length === 0;
  const reasons = hasUnspecifiedReview
    ? ['row requires review', ...currentReasons]
    : [...unresolvedStoredReasons, ...currentReasons];
  return Array.from(new Set(reasons)).map((reason) => `Row ${rowNumber}: ${reason}`);
}
