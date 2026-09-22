import { SalesInvoiceWithItems } from '../repositories/ISalesInvoiceRepository';
import { deriveInvoiceStatus, SalesInvoiceStatus } from '../utils/sales-invoice-status';

/** Read shape of a sales invoice for the FE list (status derived server-side). */
export interface SalesInvoiceSummaryDto {
  readonly id: string;
  readonly number: number;
  readonly year: number;
  readonly label: string; // "3/2026"
  readonly invoiceDate: string; // ISO
  readonly dueDate: string; // ISO
  readonly totalAmount: number;
  readonly status: SalesInvoiceStatus;
  readonly customerName: string;
  readonly deliveryNoteId: string | null;
  readonly paidAt: string | null;
  readonly lastReminderAt: string | null;
}

/** Maps a persisted invoice to its API summary, deriving the status against `now`. */
export function toSalesInvoiceSummary(
  entry: SalesInvoiceWithItems,
  now: Date,
): SalesInvoiceSummaryDto {
  const invoice = entry.salesInvoice;
  return {
    id: invoice.id,
    number: invoice.number,
    year: invoice.year,
    label: invoice.label,
    invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    totalAmount: invoice.totalAmount,
    status: deriveInvoiceStatus(invoice, now),
    customerName: invoice.customerSnapshot.name,
    deliveryNoteId: invoice.deliveryNoteId,
    paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
    lastReminderAt: invoice.lastReminderAt ? invoice.lastReminderAt.toISOString() : null,
  };
}
