import { ProformaInvoice } from '../entities/ProformaInvoice';
import { ProformaInvoiceItem } from '../entities/ProformaInvoiceItem';
import { CustomerSnapshot } from '../dtos/delivery-note.dto';

/** A proforma header together with its lines. */
export interface ProformaInvoiceWithItems {
  readonly proformaInvoice: ProformaInvoice;
  readonly items: readonly ProformaInvoiceItem[];
}

/** One line to be written to a proforma, with its frozen product snapshot. */
export interface ProformaInvoiceLineInput {
  readonly productId: string;
  readonly productName: string;
  readonly sku: string | null;
  readonly vintage: number | null;
  readonly unitOfMeasure: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly vatRate: number;
}

/** Everything needed to generate a proforma (numbering included; no warehouse impact). */
export interface GenerateProformaInvoiceRepoInput {
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderId: string;
  readonly year: number;
  readonly proformaDate: Date;
  readonly causale: string | null;
  readonly deliveryNotesText: string | null;
  readonly customerSnapshot: CustomerSnapshot;
  readonly lines: readonly ProformaInvoiceLineInput[];
}

/** Persistence contract for proforma invoices (no stock movements, no order-status change). */
export interface IProformaInvoiceRepository {
  /** Atomically assign the next progressive number and create the proforma + lines. */
  generate(input: GenerateProformaInvoiceRepoInput): Promise<ProformaInvoiceWithItems>;
  findById(id: string): Promise<ProformaInvoiceWithItems | null>;
  findManyByCompany(companyId: string): Promise<ProformaInvoiceWithItems[]>;
  /** Distinct order ids that already have at least one proforma (for the inbox step). */
  findOrderIdsByCompany(companyId: string): Promise<string[]>;
  setHtmlUrl(id: string, htmlUrl: string): Promise<void>;
}
