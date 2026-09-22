import { Prisma, PrismaClient, SalesOrderStatus } from '@prisma/client';
import { SalesOrder } from '../../domain/entities/SalesOrder';
import { SalesOrderItem } from '../../domain/entities/SalesOrderItem';
import {
  ISalesOrderRepository,
  SalesOrderWithItems,
} from '../../domain/repositories/ISalesOrderRepository';

type SalesOrderRow = Prisma.SalesOrderGetPayload<{ include: { items: true } }>;

function toWithItems(row: SalesOrderRow): SalesOrderWithItems {
  return {
    order: SalesOrder.fromPrisma(row),
    items: row.items.map(SalesOrderItem.fromPrisma),
  };
}

export class PrismaSalesOrderRepository implements ISalesOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(order: SalesOrder, items: readonly SalesOrderItem[]): Promise<SalesOrderWithItems> {
    const created = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.salesOrder.create({
        data: {
          id: order.id,
          companyId: order.companyId,
          partnerId: order.partnerId,
          orderDate: order.orderDate,
          status: order.status,
          internalNotes: order.internalNotes,
          deliveryNotesText: order.deliveryNotesText,
          sourceRef: order.sourceRef,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        },
      });
      if (items.length > 0) {
        await tx.salesOrderItem.createMany({
          data: items.map((item) => ({
            id: item.id,
            orderId: order.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            vatRate: item.vatRate,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          })),
        });
      }
      return createdOrder;
    });
    return { order: SalesOrder.fromPrisma(created), items: [...items] };
  }

  async findById(id: string): Promise<SalesOrderWithItems | null> {
    const row = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? toWithItems(row) : null;
  }

  async findManyByCompany(
    companyId: string,
    options?: { status?: SalesOrderStatus },
  ): Promise<SalesOrderWithItems[]> {
    const rows = await this.prisma.salesOrder.findMany({
      where: { companyId, ...(options?.status ? { status: options.status } : {}) },
      include: { items: true },
      orderBy: { orderDate: 'desc' },
    });
    return rows.map(toWithItems);
  }

  async updateStatus(id: string, status: SalesOrderStatus): Promise<void> {
    await this.prisma.salesOrder.update({ where: { id }, data: { status } });
  }

  async getReservedQuantities(
    companyId: string,
    options?: { excludeOrderId?: string },
  ): Promise<Record<string, number>> {
    const grouped = await this.prisma.salesOrderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          companyId,
          status: SalesOrderStatus.CONFIRMED,
          ...(options?.excludeOrderId ? { id: { not: options.excludeOrderId } } : {}),
        },
      },
      _sum: { quantity: true },
    });
    const reserved: Record<string, number> = {};
    for (const group of grouped) {
      reserved[group.productId] = group._sum.quantity ?? 0;
    }
    return reserved;
  }
}
