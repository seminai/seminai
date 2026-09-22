/**
 * Input for a single sales order line. `unitPrice` and `vatRate` fall back to the
 * product's catalog values when omitted.
 */
export interface SalesOrderItemInput {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice?: number | null;
  readonly discount?: number | null;
  readonly vatRate?: number | null;
}

/** Request payload to create a sales order (created in DRAFT status). */
export interface CreateSalesOrderDTO {
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderDate?: Date | null;
  readonly internalNotes?: string | null;
  readonly deliveryNotesText?: string | null;
  readonly sourceRef?: string | null;
  readonly items: readonly SalesOrderItemInput[];
}
