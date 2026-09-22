/** Default payment term when auto-creating an invoice from a shipped DDT. */
export const INVOICE_DUE_DAYS = 30;

/** A priced line (DDT/invoice item) sufficient to compute its gross amount. */
export interface PricedLine {
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number; // percentage 0–100
  readonly vatRate: number; // percentage
}

/** Gross line amount: qty · unitPrice · (1 − discount%) · (1 + vat%). */
export function lineGrossAmount(line: PricedLine): number {
  return line.quantity * line.unitPrice * (1 - line.discount / 100) * (1 + line.vatRate / 100);
}

/** Sum of gross line amounts, rounded to 2 decimals (currency). */
export function computeInvoiceTotal(lines: readonly PricedLine[]): number {
  const total = lines.reduce((sum, line) => sum + lineGrossAmount(line), 0);
  return Math.round(total * 100) / 100;
}

/** `dueDate = from + INVOICE_DUE_DAYS` (does not mutate `from`). */
export function computeDueDate(from: Date, dueDays: number = INVOICE_DUE_DAYS): Date {
  return new Date(from.getTime() + dueDays * 24 * 60 * 60 * 1000);
}
