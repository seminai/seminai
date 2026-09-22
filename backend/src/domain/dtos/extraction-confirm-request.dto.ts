import { type DdtEntry } from './ddt-entry.dto';
import { type InvoiceEntry } from './invoice-entry.dto';

export type ConfirmableStockEntry = InvoiceEntry | DdtEntry;

export interface ConfirmExtractionRequestDTO {
  readonly warehouseId?: string;
  readonly invoiceEntries?: readonly ConfirmableStockEntry[];
  readonly allowReviewOverride?: boolean;
  readonly actorUserId?: string;
}
