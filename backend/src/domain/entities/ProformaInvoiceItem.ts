import { ProformaInvoiceItem as PrismaProformaInvoiceItem } from '@prisma/client';

/** Immutable shape of a proforma line, including the historical product snapshot. */
export interface ProformaInvoiceItemProps {
  readonly id: string;
  readonly proformaInvoiceId: string;
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

/** A single proforma line that freezes the product data at generation time. */
export class ProformaInvoiceItem implements ProformaInvoiceItemProps {
  readonly id: string;
  readonly proformaInvoiceId: string;
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

  constructor(props: ProformaInvoiceItemProps) {
    this.id = props.id;
    this.proformaInvoiceId = props.proformaInvoiceId;
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

  static fromPrisma(row: PrismaProformaInvoiceItem): ProformaInvoiceItem {
    return new ProformaInvoiceItem(row);
  }
}
