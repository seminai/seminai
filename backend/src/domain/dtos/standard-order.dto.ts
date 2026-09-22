/**
 * Normalized order DTOs for Phase 1 (agent order template).
 * A fixed-column Excel template is parsed into `StandardOrderDto`; the import use
 * case then resolves customer + products and yields an `OrderTemplatePreviewDto`
 * before any persistence. Plain interfaces, `readonly`, literal unions, ISO dates.
 */

/** Channel the order template arrived through. */
export type OrderSourceChannel = 'email' | 'whatsapp' | 'chat' | 'template';

/** One raw order line as read from the template. */
export interface StandardOrderLineDto {
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice?: number | null;
  readonly vintage?: number | null;
}

/** The normalized order parsed from the template (pre-resolution). */
export interface StandardOrderDto {
  readonly customerName: string;
  readonly customerVat?: string | null;
  readonly lines: readonly StandardOrderLineDto[];
  readonly deliveryNotesText?: string | null;
  readonly sourceChannel: OrderSourceChannel;
}

/** Result of matching the template customer against the company anagrafica. */
export interface ResolvedPartnerDto {
  readonly matchedId: string | null;
  /** true when unmatched but creatable → the customer will be auto-created on commit. */
  readonly willCreate: boolean;
  readonly name: string;
  readonly vatNumber?: string | null;
}

/** A template line enriched with its product-catalog resolution. */
export interface ResolvedOrderLineDto extends StandardOrderLineDto {
  readonly matchedProductId: string | null;
  readonly unitPriceResolved: number | null;
  readonly warnings: readonly string[];
}

/** Read-only preview returned before creating the DRAFT order. */
export interface OrderTemplatePreviewDto {
  readonly standardOrder: StandardOrderDto;
  readonly partner: ResolvedPartnerDto;
  readonly lines: readonly ResolvedOrderLineDto[];
  readonly warnings: readonly string[];
  /** true ⇔ partner matched AND every line matched AND at least one line. */
  readonly canCreate: boolean;
}
