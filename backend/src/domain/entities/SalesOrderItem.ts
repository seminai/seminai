import { randomUUID } from 'node:crypto';
import { SalesOrderItem as PrismaSalesOrderItem } from '@prisma/client';

/** Immutable shape of a sales order line. */
export interface SalesOrderItemProps {
  readonly id: string;
  readonly orderId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly vatRate: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A single line of a sales order. */
export class SalesOrderItem implements SalesOrderItemProps {
  readonly id: string;
  readonly orderId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly vatRate: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SalesOrderItemProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.productId = props.productId;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    this.discount = props.discount;
    this.vatRate = props.vatRate;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    orderId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    vatRate: number;
  }): SalesOrderItem {
    const now = new Date();
    return new SalesOrderItem({
      id: randomUUID(),
      orderId: props.orderId,
      productId: props.productId,
      quantity: props.quantity,
      unitPrice: props.unitPrice,
      discount: props.discount ?? 0,
      vatRate: props.vatRate,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromPrisma(row: PrismaSalesOrderItem): SalesOrderItem {
    return new SalesOrderItem(row);
  }
}
