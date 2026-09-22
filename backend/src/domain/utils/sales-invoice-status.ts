/** Derived (never persisted) status of a sales invoice. */
export type SalesInvoiceStatus = 'OPEN' | 'OVERDUE' | 'PAID';

/**
 * Derives an invoice's status from `paidAt` + `dueDate` — no Prisma enum needed.
 * PAID once `paidAt` is set; OVERDUE while unpaid past the due date; OPEN otherwise.
 */
export function deriveInvoiceStatus(
  invoice: { readonly paidAt: Date | null; readonly dueDate: Date },
  now: Date = new Date(),
): SalesInvoiceStatus {
  if (invoice.paidAt) return 'PAID';
  if (invoice.dueDate.getTime() < now.getTime()) return 'OVERDUE';
  return 'OPEN';
}
