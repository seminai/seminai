import { SalesOrderStatus } from '@prisma/client';
import { SalesOrder } from '../entities/SalesOrder';
import { SalesOrderItem } from '../entities/SalesOrderItem';

/** A sales order header together with its lines. */
export interface SalesOrderWithItems {
  readonly order: SalesOrder;
  readonly items: readonly SalesOrderItem[];
}

/** Persistence contract for sales orders. */
export interface ISalesOrderRepository {
  create(order: SalesOrder, items: readonly SalesOrderItem[]): Promise<SalesOrderWithItems>;
  findById(id: string): Promise<SalesOrderWithItems | null>;
  findManyByCompany(
    companyId: string,
    options?: { status?: SalesOrderStatus },
  ): Promise<SalesOrderWithItems[]>;
  updateStatus(id: string, status: SalesOrderStatus): Promise<void>;
  /**
   * Reserved quantity per productId across CONFIRMED orders (not yet shipped).
   * `excludeOrderId` omits a specific order from the reservation total.
   */
  getReservedQuantities(
    companyId: string,
    options?: { excludeOrderId?: string },
  ): Promise<Record<string, number>>;
}
