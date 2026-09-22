import { Prisma, PrismaClient } from '@prisma/client';
import { SalesInvoice } from '../../domain/entities/SalesInvoice';
import { SalesInvoiceItem } from '../../domain/entities/SalesInvoiceItem';
import {
  ISalesInvoiceRepository,
  SalesInvoiceWithItems,
} from '../../domain/repositories/ISalesInvoiceRepository';

type Row = Prisma.SalesInvoiceGetPayload<{ include: { items: true } }>;

function toWithItems(row: Row): SalesInvoiceWithItems {
  return {
    salesInvoice: SalesInvoice.fromPrisma(row),
    items: row.items.map(SalesInvoiceItem.fromPrisma),
  };
}

export class PrismaSalesInvoiceRepository implements ISalesInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<SalesInvoiceWithItems | null> {
    const row = await this.prisma.salesInvoice.findUnique({
      where: { id },
      include: { items: true },
    });
    return row ? toWithItems(row) : null;
  }

  async findManyByCompany(
    companyId: string,
    options?: { overdueOnly?: boolean; now?: Date },
  ): Promise<SalesInvoiceWithItems[]> {
    const now = options?.now ?? new Date();
    const rows = await this.prisma.salesInvoice.findMany({
      where: {
        companyId,
        ...(options?.overdueOnly ? { paidAt: null, dueDate: { lt: now } } : {}),
      },
      orderBy: [{ year: 'desc' }, { number: 'desc' }],
      include: { items: true },
    });
    return rows.map(toWithItems);
  }

  async findOverdueByCompany(companyId: string, now: Date): Promise<SalesInvoiceWithItems[]> {
    const rows = await this.prisma.salesInvoice.findMany({
      where: { companyId, paidAt: null, dueDate: { lt: now } },
      orderBy: { dueDate: 'asc' },
      include: { items: true },
    });
    return rows.map(toWithItems);
  }

  async markReminderSent(id: string, at: Date): Promise<void> {
    await this.prisma.salesInvoice.update({ where: { id }, data: { lastReminderAt: at } });
  }

  async markPaid(id: string, at: Date): Promise<SalesInvoiceWithItems> {
    const row = await this.prisma.salesInvoice.update({
      where: { id },
      data: { paidAt: at },
      include: { items: true },
    });
    return toWithItems(row);
  }
}
