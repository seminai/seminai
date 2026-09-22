import { deriveInvoiceStatus } from '../domain/utils/sales-invoice-status';

describe('deriveInvoiceStatus', () => {
  const now = new Date('2026-07-01T12:00:00.000Z');

  it('is PAID once paidAt is set (regardless of dueDate)', () => {
    expect(
      deriveInvoiceStatus({ paidAt: new Date('2026-06-30'), dueDate: new Date('2026-06-01') }, now),
    ).toBe('PAID');
  });

  it('is OVERDUE when unpaid and past the due date', () => {
    expect(deriveInvoiceStatus({ paidAt: null, dueDate: new Date('2026-06-30') }, now)).toBe(
      'OVERDUE',
    );
  });

  it('is OPEN when unpaid and not yet due', () => {
    expect(deriveInvoiceStatus({ paidAt: null, dueDate: new Date('2026-07-31') }, now)).toBe(
      'OPEN',
    );
  });
});
