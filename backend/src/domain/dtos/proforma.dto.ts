/** Request payload to generate a proforma invoice from an order. */
export interface GenerateProformaDTO {
  readonly orderId: string;
  readonly causale?: string | null;
  readonly deliveryNotesText?: string | null;
  readonly proformaDate?: Date | null;
}
