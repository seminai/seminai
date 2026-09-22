import {
  INVOICE_DUE_DAYS,
  computeDueDate,
  computeInvoiceTotal,
  lineGrossAmount,
} from '../domain/utils/sales-invoice-amount';

describe('sales-invoice amount helpers', () => {
  it('lineGrossAmount applies discount then VAT', () => {
    // 10 × 5 = 50; −10% = 45; +22% = 54.9
    expect(lineGrossAmount({ quantity: 10, unitPrice: 5, discount: 10, vatRate: 22 })).toBeCloseTo(
      54.9,
      5,
    );
  });

  it('computeInvoiceTotal sums lines rounded to 2 decimals', () => {
    const total = computeInvoiceTotal([
      { quantity: 2, unitPrice: 12, discount: 0, vatRate: 22 }, // 29.28
      { quantity: 1, unitPrice: 10, discount: 0, vatRate: 10 }, // 11.00
    ]);
    expect(total).toBe(40.28);
  });

  it('computeDueDate adds the default 30 days without mutating the input', () => {
    const from = new Date('2026-07-01T00:00:00.000Z');
    const due = computeDueDate(from);
    expect(due.toISOString()).toBe('2026-07-31T00:00:00.000Z');
    expect(from.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(INVOICE_DUE_DAYS).toBe(30);
  });
});
