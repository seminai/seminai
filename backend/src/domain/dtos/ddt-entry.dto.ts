/**
 * Represents a single product line extracted from a delivery note (DDT) document.
 */
import { DdtProductCategory } from './ddt-product-category.dto';

export interface DdtEntry {
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly productCategory: DdtProductCategory;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly quantityConverted?: number | null;
  readonly unitMeasureConverted?: string | null;
  readonly accepted?: boolean;
  readonly supplierName: string | null;
  readonly supplierVat: string | null;
  readonly ddtDate: string | null;
  readonly orderNumber: string | null;
  readonly unitPrice?: number | null;
  readonly totalPrice?: number | null;
  readonly needsReview?: boolean;
  readonly reviewReasons?: readonly string[];
  readonly sourceRowIndex?: number;
  readonly productCode?: string | null;
  readonly rawLine?: string;
  readonly sourceChannel?: 'llm-primary' | 'deterministic-fallback' | 'xml';
}
