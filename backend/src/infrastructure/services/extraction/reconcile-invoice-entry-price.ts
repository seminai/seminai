import { type ConfirmableStockEntry } from '../../../domain/dtos/extraction-confirm-request.dto';
import { isRowCoherenceReviewReason, validateRowCoherence } from './row-validator';

const PRICE_MISMATCH_PREFIX = 'Price mismatch:';

/**
 * Makes the persisted unit price consistent with the authoritative line total.
 */
export function reconcileInvoiceEntryPrice(entry: ConfirmableStockEntry): ConfirmableStockEntry {
  const verdict = validateRowCoherence({
    quantity: entry.quantity,
    quantityUnitOfMeasure: entry.quantityUnitOfMeasure,
    unitPrice: entry.unitPrice ?? null,
    totalPrice: entry.totalPrice ?? null,
  });
  const hasPriceMismatch = verdict.reasons.some((reason) =>
    reason.startsWith(PRICE_MISMATCH_PREFIX),
  );
  const quantity = entry.quantity;
  const totalPrice = entry.totalPrice;
  if (!hasPriceMismatch || quantity === null || totalPrice == null) return entry;
  const correctedEntry = {
    ...entry,
    unitPrice: totalPrice / quantity,
  };
  const currentReasons = validateRowCoherence({
    quantity: correctedEntry.quantity,
    quantityUnitOfMeasure: correctedEntry.quantityUnitOfMeasure,
    unitPrice: correctedEntry.unitPrice,
    totalPrice,
  }).reasons;
  const storedReasons = (entry.reviewReasons ?? []).filter(
    (reason) => !isRowCoherenceReviewReason(reason),
  );
  const reviewReasons = Array.from(new Set([...storedReasons, ...currentReasons]));
  const hasUnspecifiedReview =
    entry.needsReview === true && (entry.reviewReasons ?? []).length === 0;
  return {
    ...correctedEntry,
    needsReview: hasUnspecifiedReview || reviewReasons.length > 0,
    reviewReasons,
  };
}
