/**
 * Centralized stock field validation and normalization.
 *
 * Every stock-creation path should use these helpers so that:
 * - Required fields are checked consistently (only quantity + unitOfMeasureQuantity).
 * - ddtCode is always trimmed (empty / whitespace-only → null).
 * - unitOfMeasurePrice defaults to 'EUR' everywhere.
 */

/** Result of stock field validation. */
export interface StockValidationResult {
  valid: boolean;
  /** Human-readable reason when `valid` is false. */
  reason?: string;
}

/**
 * Validates the minimum required stock fields.
 * Only `quantity` (finite number) and `unitOfMeasureQuantity` (non-blank string)
 * are mandatory across **every** entry-point.
 */
export function validateStockFields(
  quantity: unknown,
  unitOfMeasureQuantity: unknown,
): StockValidationResult {
  if (typeof quantity !== 'number' || Number.isNaN(quantity)) {
    return { valid: false, reason: 'quantity must be a valid number' };
  }
  if (typeof unitOfMeasureQuantity !== 'string' || unitOfMeasureQuantity.trim().length === 0) {
    return {
      valid: false,
      reason: 'unitOfMeasureQuantity is required and must be a non-empty string',
    };
  }
  return { valid: true };
}

/**
 * Normalizes a DDT code:
 * - trims whitespace
 * - returns `null` for empty / whitespace-only / falsy values
 */
export function normalizeDdtCode(ddtCode: string | null | undefined): string | null {
  if (!ddtCode || typeof ddtCode !== 'string') return null;
  const trimmed = ddtCode.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Returns a consistent default for `unitOfMeasurePrice`.
 */
export function defaultUnitOfMeasurePrice(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value.trim() : 'EUR';
}
