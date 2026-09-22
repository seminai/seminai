import { SalesInvoiceItem as PrismaSalesInvoiceItem } from '@prisma/client';

/** Immutable shape of a sales-invoice line, including the historical product snapshot. */
export interface SalesInvoiceItemProps {
  readonly id: string;
  readonly salesInvoiceId: string;
  readonly productId: string | null;
  readonly productName: string;
  readonly sku: string | null;
  readonly vintage: number | null;
  readonly unitOfMeasure: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly vatRate: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A single sales-invoice line that freezes the product data at generation time. */
export class SalesInvoiceItem implements SalesInvoiceItemProps {
  readonly id: string;
  readonly salesInvoiceId: string;
  readonly productId: string | null;
  readonly productName: string;
  readonly sku: string | null;
  readonly vintage: number | null;
  readonly unitOfMeasure: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly vatRate: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SalesInvoiceItemProps) {
    this.id = props.id;
    this.salesInvoiceId = props.salesInvoiceId;
    this.productId = props.productId;
    this.productName = props.productName;
    this.sku = props.sku;
    this.vintage = props.vintage;
    this.unitOfMeasure = props.unitOfMeasure;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    this.discount = props.discount;
    this.vatRate = props.vatRate;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static fromPrisma(row: PrismaSalesInvoiceItem): SalesInvoiceItem {
    return new SalesInvoiceItem(row);
  }
}
