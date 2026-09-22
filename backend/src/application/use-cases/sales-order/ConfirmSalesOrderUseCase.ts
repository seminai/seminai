import { SalesOrderStatus } from '@prisma/client';
import {
  ISalesOrderRepository,
  SalesOrderWithItems,
} from '../../../domain/repositories/ISalesOrderRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { AppError } from '../../../domain/errors/AppError';

/**
 * Confirms a DRAFT order after validating availability for every product:
 * available-to-promise = physical balance − quantity reserved by other confirmed orders.
 */
export class ConfirmSalesOrderUseCase {
  constructor(
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly stockRepository: IStockRepository,
  ) {}

  async execute(params: { orderId: string }): Promise<SalesOrderWithItems> {
    const found = await this.salesOrderRepository.findById(params.orderId);
    if (!found) {
      throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }
    const { order, items } = found;
    if (order.status === SalesOrderStatus.CANCELLED) {
      throw AppError.conflict('Order is cancelled', 'ORDER_CANCELLED');
    }
    if (order.status === SalesOrderStatus.FULFILLED) {
      throw AppError.conflict('Order already fulfilled', 'ORDER_FULFILLED');
    }
    if (order.status === SalesOrderStatus.CONFIRMED) {
      return found;
    }
    const reserved = await this.salesOrderRepository.getReservedQuantities(order.companyId, {
      excludeOrderId: order.id,
    });
    const requestedByProduct = new Map<string, number>();
    for (const item of items) {
      requestedByProduct.set(
        item.productId,
        (requestedByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }
    for (const [productId, requested] of requestedByProduct) {
      const available = await this.stockRepository.getAvailableQuantity(productId, order.companyId);
      const availableToPromise = available - (reserved[productId] ?? 0);
      if (availableToPromise < requested) {
        throw AppError.conflict(
          `Giacenza insufficiente per il prodotto ${productId}: disponibili ${availableToPromise}, richiesti ${requested}`,
          'INSUFFICIENT_STOCK',
        );
      }
    }
    await this.salesOrderRepository.updateStatus(order.id, SalesOrderStatus.CONFIRMED);
    const refreshed = await this.salesOrderRepository.findById(order.id);
    return refreshed ?? found;
  }
}
