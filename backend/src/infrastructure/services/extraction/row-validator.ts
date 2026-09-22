/**
 * Semantic validation for extracted invoice/DDT rows.
 *
 * Flags a row as `needsReview` when:
 * - the unit of measure is not in the canonical whitelist (most common cause
 *   of the "4200 kg from 7 NR" kind of ghost rows shown in the screenshot);
 * - quantity is missing, non-positive, or absurdly large;
 * - unitPrice*quantity disagrees with totalPrice beyond a small tolerance.
 *
 * The flag is consumed by the FE (tabella "Revisione prodotti") to surface
 * the rows that the user should double-check before saving.
 */

import { CANONICAL_UNITS } from './extraction-schema';

export interface RowCoherenceInput {
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
}

export interface RowValidationResult {
  readonly needsReview: boolean;
  readonly reasons: readonly string[];
}

const TOTAL_PRICE_TOLERANCE = 0.03;
const MAX_REASONABLE_QUANTITY = 100_000;
const UNIT_WHITELIST = new Set<string>(CANONICAL_UNITS.map((unit) => unit.toUpperCase()));
const ROW_COHERENCE_REASON_PREFIXES = [
  'Unknown unit of measure:',
  'Missing quantity',
  'Non-positive quantity',
  'Quantity unusually large',
  'Price mismatch:',
] as const;

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  KGS: 'KG',
  CHILOGRAMMI: 'KG',
  CHILO: 'KG',
  CHILOS: 'KG',
  GRAMMI: 'G',
  GR: 'G',
  LITRI: 'L',
  LITRO: 'L',
  LT: 'L',
  LITER: 'L',
  LITERS: 'L',
  MILLILITRI: 'ML',
  TONNELLATE: 'T',
  TON: 'T',
  TN: 'T',
  TM: 'T',
  QUINTALE: 'Q',
  QUINTALI: 'Q',
  QL: 'Q',
  QLE: 'Q',
  PEZZI: 'PZ',
  PEZZO: 'PZ',
  NUMERO: 'NR',
  NUMR: 'NR',
  CONF: 'CF',
  CARTONE: 'CT',
  CARTONI: 'CT',
  SACCHI: 'SC',
  SACCO: 'SC',
};

/**
 * Returns the canonical unit for an arbitrary input string, or null if it
 * cannot be resolved with high confidence.
 */
export function canonicalizeUnit(raw: string | null): string | null {
  if (!raw) return null;
  const upper = raw.replace(/\./g, '').trim().toUpperCase();
  if (!upper) return null;
  if (UNIT_WHITELIST.has(upper)) return upper;
  if (UNIT_ALIASES[upper]) return UNIT_ALIASES[upper];
  return null;
}

/**
 * Identifies review reasons that can be recalculated from the editable row fields.
 */
export function isRowCoherenceReviewReason(reason: string): boolean {
  return ROW_COHERENCE_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix));
}

/**
 * Runs the coherence checks on a single row and returns the review verdict.
 */
export function validateRowCoherence(input: RowCoherenceInput): RowValidationResult {
  const reasons: string[] = [];
  const canonicalUnit = canonicalizeUnit(input.quantityUnitOfMeasure);
  if (input.quantityUnitOfMeasure && !canonicalUnit) {
    reasons.push(`Unknown unit of measure: ${input.quantityUnitOfMeasure}`);
  }
  if (input.quantity === null || input.quantity === undefined) {
    reasons.push('Missing quantity');
  } else if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    reasons.push('Non-positive quantity');
  } else if (input.quantity > MAX_REASONABLE_QUANTITY) {
    reasons.push('Quantity unusually large');
  }
  if (
    input.quantity !== null &&
    input.unitPrice !== null &&
    input.totalPrice !== null &&
    input.totalPrice !== 0
  ) {
    const expected = input.quantity * input.unitPrice;
    const relativeDelta = Math.abs(expected - input.totalPrice) / Math.abs(input.totalPrice);
    if (relativeDelta > TOTAL_PRICE_TOLERANCE) {
      reasons.push(`Price mismatch: ${input.quantity} * ${input.unitPrice} != ${input.totalPrice}`);
    }
  }
  return { needsReview: reasons.length > 0, reasons };
}
