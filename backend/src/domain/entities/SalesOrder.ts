import { randomUUID } from 'node:crypto';
import { SalesOrder as PrismaSalesOrder, SalesOrderStatus } from '@prisma/client';
import { SalesOrderItem } from './SalesOrderItem';
import { computeSalesTotals, SalesTotals } from '../utils/sales-totals';

/** Immutable shape of a sales order header. */
export interface SalesOrderProps {
  readonly id: string;
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderDate: Date;
  readonly status: SalesOrderStatus;
  readonly internalNotes: string | null;
  readonly deliveryNotesText: string | null;
  readonly sourceRef: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Sales order header. Totals are computed from its items, never stored. */
export class SalesOrder implements SalesOrderProps {
  readonly id: string;
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderDate: Date;
  readonly status: SalesOrderStatus;
  readonly internalNotes: string | null;
  readonly deliveryNotesText: string | null;
  readonly sourceRef: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SalesOrderProps) {
    this.id = props.id;
    this.companyId = props.companyId;
    this.partnerId = props.partnerId;
    this.orderDate = props.orderDate;
    this.status = props.status;
    this.internalNotes = props.internalNotes;
    this.deliveryNotesText = props.deliveryNotesText;
    this.sourceRef = props.sourceRef;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    companyId: string;
    partnerId: string;
    orderDate?: Date | null;
    internalNotes?: string | null;
    deliveryNotesText?: string | null;
    sourceRef?: string | null;
  }): SalesOrder {
    const now = new Date();
    return new SalesOrder({
      id: randomUUID(),
      companyId: props.companyId,
      partnerId: props.partnerId,
      orderDate: props.orderDate ?? now,
      status: SalesOrderStatus.DRAFT,
      internalNotes: props.internalNotes ?? null,
      deliveryNotesText: props.deliveryNotesText ?? null,
      sourceRef: props.sourceRef ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromPrisma(row: PrismaSalesOrder): SalesOrder {
    return new SalesOrder(row);
  }

  /** Computes imponibile, IVA and totale from the given lines. */
  computeTotals(items: readonly SalesOrderItem[]): SalesTotals {
    return computeSalesTotals(items);
  }
}
