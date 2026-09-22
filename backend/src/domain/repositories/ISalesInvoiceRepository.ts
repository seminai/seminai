import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';

/** A sales-invoice header together with its lines. */
export interface SalesInvoiceWithItems {
  readonly salesInvoice: SalesInvoice;
  readonly items: readonly SalesInvoiceItem[];
}

/** Persistence contract for sales invoices (Phase 5a). Status is derived, never stored. */
export interface ISalesInvoiceRepository {
  findById(id: string): Promise<SalesInvoiceWithItems | null>;
  findManyByCompany(
    companyId: string,
    options?: { overdueOnly?: boolean; now?: Date },
  ): Promise<SalesInvoiceWithItems[]>;
  /** Unpaid invoices past their due date (`paidAt: null, dueDate < now`). */
  findOverdueByCompany(companyId: string, now: Date): Promise<SalesInvoiceWithItems[]>;
  markReminderSent(id: string, at: Date): Promise<void>;
  markPaid(id: string, at: Date): Promise<SalesInvoiceWithItems>;
}
