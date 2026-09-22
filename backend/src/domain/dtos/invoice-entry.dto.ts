/**
 * Represents a single product line extracted from an invoice (Fattura) document.
 */
import { InvoiceProductCategory } from './invoice-product-category.dto';

export interface InvoiceEntry {
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly productCategory: InvoiceProductCategory;
  readonly administrativeStatus: string | null;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly quantityConverted?: number | null;
  readonly unitMeasureConverted?: string | null;
  readonly accepted?: boolean;
  readonly supplierName: string | null;
  readonly supplierVat: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string | null;
  readonly invoiceDueDate: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  readonly needsReview?: boolean;
  readonly reviewReasons?: readonly string[];
  readonly sourceRowIndex?: number;
  readonly productCode?: string | null;
  readonly rawLine?: string;
  readonly sourceChannel?: 'llm-primary' | 'deterministic-fallback' | 'xml';
}
