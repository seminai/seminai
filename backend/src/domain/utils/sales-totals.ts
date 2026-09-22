/**
 * Pure helpers to compute sales line and document totals.
 * Shared by sales orders and delivery notes since both carry the same line shape
 * (quantity, unit price, discount %, VAT rate %).
 */

/** A single priced line. `discount` and `vatRate` are percentages (0–100). */
export interface SalesLine {
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly vatRate: number;
}

/** Aggregated document totals. */
export interface SalesTotals {
  /** Imponibile (net of VAT, after discount). */
  readonly taxableAmount: number;
  /** IVA (VAT amount). */
  readonly vatAmount: number;
  /** Totale (taxable + VAT). */
  readonly total: number;
}

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Net amount of a line after discount, excluding VAT. */
export function computeLineNet(line: SalesLine): number {
  const discountFactor = 1 - (line.discount ?? 0) / 100;
  return roundCurrency(line.quantity * line.unitPrice * discountFactor);
}

/** VAT amount of a line. */
export function computeLineVat(line: SalesLine): number {
  return roundCurrency((computeLineNet(line) * (line.vatRate ?? 0)) / 100);
}

/** Aggregates imponibile, IVA and totale across all lines. */
export function computeSalesTotals(lines: readonly SalesLine[]): SalesTotals {
  const taxableAmount = roundCurrency(lines.reduce((sum, line) => sum + computeLineNet(line), 0));
  const vatAmount = roundCurrency(lines.reduce((sum, line) => sum + computeLineVat(line), 0));
  return { taxableAmount, vatAmount, total: roundCurrency(taxableAmount + vatAmount) };
}
