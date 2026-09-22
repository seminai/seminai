import { SalesInvoice as PrismaSalesInvoice } from '@prisma/client';
import { CustomerSnapshot } from '../dtos/delivery-note.dto';

/** Immutable shape of a sales-invoice header. */
export interface SalesInvoiceProps {
  readonly id: string;
  readonly companyId: string;
  readonly partnerId: string;
  readonly deliveryNoteId: string | null;
  readonly number: number;
  readonly year: number;
  readonly invoiceDate: Date;
  readonly dueDate: Date;
  readonly totalAmount: number;
  readonly causale: string | null;
  readonly customerSnapshot: CustomerSnapshot;
  readonly paidAt: Date | null;
  readonly lastReminderAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Sales invoice (money owed by a customer). Progressive numbering per (companyId, year)
 * and a frozen `customerSnapshot`. Status is DERIVED (see `deriveInvoiceStatus`).
 */
export class SalesInvoice implements SalesInvoiceProps {
  readonly id: string;
  readonly companyId: string;
  readonly partnerId: string;
  readonly deliveryNoteId: string | null;
  readonly number: number;
  readonly year: number;
  readonly invoiceDate: Date;
  readonly dueDate: Date;
  readonly totalAmount: number;
  readonly causale: string | null;
  readonly customerSnapshot: CustomerSnapshot;
  readonly paidAt: Date | null;
  readonly lastReminderAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SalesInvoiceProps) {
    this.id = props.id;
    this.companyId = props.companyId;
    this.partnerId = props.partnerId;
    this.deliveryNoteId = props.deliveryNoteId;
    this.number = props.number;
    this.year = props.year;
    this.invoiceDate = props.invoiceDate;
    this.dueDate = props.dueDate;
    this.totalAmount = props.totalAmount;
    this.causale = props.causale;
    this.customerSnapshot = props.customerSnapshot;
    this.paidAt = props.paidAt;
    this.lastReminderAt = props.lastReminderAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static fromPrisma(row: PrismaSalesInvoice): SalesInvoice {
    return new SalesInvoice({
      ...row,
      customerSnapshot: row.customerSnapshot as unknown as CustomerSnapshot,
    });
  }

  /** Human-readable progressive label, e.g. "12/2026". */
  get label(): string {
    return `${this.number}/${this.year}`;
  }
}
