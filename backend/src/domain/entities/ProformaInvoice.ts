import { ProformaInvoice as PrismaProformaInvoice } from '@prisma/client';
import { CustomerSnapshot } from '../dtos/delivery-note.dto';

/** Immutable shape of a proforma header. */
export interface ProformaInvoiceProps {
  readonly id: string;
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderId: string | null;
  readonly number: number;
  readonly year: number;
  readonly proformaDate: Date;
  readonly causale: string | null;
  readonly deliveryNotesText: string | null;
  readonly customerSnapshot: CustomerSnapshot;
  readonly htmlUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Proforma invoice (non-fiscal document). Progressive numbering per (companyId, year)
 * and a frozen `customerSnapshot` keep generated documents immutable. No warehouse impact.
 */
export class ProformaInvoice implements ProformaInvoiceProps {
  readonly id: string;
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderId: string | null;
  readonly number: number;
  readonly year: number;
  readonly proformaDate: Date;
  readonly causale: string | null;
  readonly deliveryNotesText: string | null;
  readonly customerSnapshot: CustomerSnapshot;
  readonly htmlUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ProformaInvoiceProps) {
    this.id = props.id;
    this.companyId = props.companyId;
    this.partnerId = props.partnerId;
    this.orderId = props.orderId;
    this.number = props.number;
    this.year = props.year;
    this.proformaDate = props.proformaDate;
    this.causale = props.causale;
    this.deliveryNotesText = props.deliveryNotesText;
    this.customerSnapshot = props.customerSnapshot;
    this.htmlUrl = props.htmlUrl;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static fromPrisma(row: PrismaProformaInvoice): ProformaInvoice {
    return new ProformaInvoice({
      ...row,
      customerSnapshot: row.customerSnapshot as unknown as CustomerSnapshot,
    });
  }

  /** Human-readable progressive label, e.g. "12/2026". */
  get label(): string {
    return `${this.number}/${this.year}`;
  }
}
