import { randomUUID } from 'node:crypto';
import { DeliveryNoteStatus, Prisma, PrismaClient, SalesOrderStatus } from '@prisma/client';
import { AppError } from '../../domain/errors/AppError';
import { DeliveryNote } from '../../domain/entities/DeliveryNote';
import { DeliveryNoteItem } from '../../domain/entities/DeliveryNoteItem';
import {
  DeliveryNoteWithItems,
  GenerateDeliveryNoteRepoInput,
} from '../../domain/repositories/IDeliveryNoteRepository';
import { computeDueDate, computeInvoiceTotal } from '../../domain/utils/sales-invoice-amount';

type Tx = Prisma.TransactionClient;

/**
 * Available physical balance of a product, replicating the canonical convention
 * (calculateAggregatedStock): IN movements are positive, OUT movements negative,
 * and OUT from unverified jobs does not count as consumed.
 */
async function computeAvailableTx(tx: Tx, productId: string): Promise<number> {
  const inAgg = await tx.stock.aggregate({
    where: { productId, quantity: { gt: 0 }, type: 'IN' },
    _sum: { quantity: true },
  });
  const outAgg = await tx.stock.aggregate({
    where: {
      productId,
      quantity: { lt: 0 },
      type: 'OUT',
      OR: [{ jobId: null }, { job: { isVerified: true } }],
    },
    _sum: { quantity: true },
  });
  return (inAgg._sum.quantity ?? 0) + (outAgg._sum.quantity ?? 0);
}

/**
 * Atomically generate a DDT: validate availability, assign the progressive number,
 * create header + lines, write Stock OUT movements (scarico) and mark the order FULFILLED.
 * Any failure rolls back the whole transaction, leaving the warehouse untouched.
 */
export async function generateDeliveryNoteTx(
  prisma: PrismaClient,
  input: GenerateDeliveryNoteRepoInput,
): Promise<DeliveryNoteWithItems> {
  return prisma.$transaction(async (tx) => {
    for (const line of input.lines) {
      const available = await computeAvailableTx(tx, line.productId);
      if (available < line.quantity) {
        throw AppError.conflict(
          `Giacenza insufficiente per "${line.productName}": disponibili ${available}, richiesti ${line.quantity}`,
          'INSUFFICIENT_STOCK',
        );
      }
    }

    const last = await tx.deliveryNote.findFirst({
      where: { companyId: input.companyId, year: input.year },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;
    const ddtCode = `${number}/${input.year}`;
    const now = new Date();
    const ddtId = randomUUID();

    const createdNote = await tx.deliveryNote.create({
      data: {
        id: ddtId,
        companyId: input.companyId,
        partnerId: input.partnerId,
        orderId: input.orderId,
        number,
        year: input.year,
        ddtDate: input.ddtDate,
        status: DeliveryNoteStatus.GENERATED,
        causale: input.causale,
        carrier: input.carrier,
        packagesCount: input.packagesCount,
        estimatedWeightKg: input.estimatedWeightKg,
        deliveryNotesText: input.deliveryNotesText,
        customerSnapshot: input.customerSnapshot as unknown as Prisma.InputJsonValue,
        createdAt: now,
        updatedAt: now,
      },
    });

    const createdItems = [];
    for (const line of input.lines) {
      const item = await tx.deliveryNoteItem.create({
        data: {
          id: randomUUID(),
          deliveryNoteId: ddtId,
          productId: line.productId,
          productName: line.productName,
          sku: line.sku,
          vintage: line.vintage,
          unitOfMeasure: line.unitOfMeasure,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          vatRate: line.vatRate,
          createdAt: now,
          updatedAt: now,
        },
      });
      createdItems.push(item);
      await tx.stock.create({
        data: {
          id: randomUUID(),
          productId: line.productId,
          quantity: -Math.abs(line.quantity),
          unitOfMeasureQuantity: line.unitOfMeasure ?? 'pz',
          price: line.unitPrice,
          unitOfMeasurePrice: 'EUR',
          type: 'OUT',
          ddtCode,
          ddtDate: input.ddtDate,
          deliveryNoteId: ddtId,
          notes: `Scarico magazzino DDT ${ddtCode}`,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    await tx.salesOrder.update({
      where: { id: input.orderId },
      data: { status: SalesOrderStatus.FULFILLED },
    });

    return {
      deliveryNote: DeliveryNote.fromPrisma(createdNote),
      items: createdItems.map(DeliveryNoteItem.fromPrisma),
    };
  });
}

/**
 * Marks a GENERATED DDT as SENT (handed to the courier). No warehouse movements,
 * no order-status change. Idempotent guard: only GENERATED → SENT is allowed.
 */
export async function markSentDeliveryNoteTx(
  prisma: PrismaClient,
  deliveryNoteId: string,
): Promise<DeliveryNoteWithItems> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.deliveryNote.findUnique({ where: { id: deliveryNoteId } });
    if (!existing) {
      throw AppError.notFound('DDT non trovato', 'DDT_NOT_FOUND');
    }
    if (existing.status === DeliveryNoteStatus.SENT) {
      throw AppError.conflict('DDT già inviato', 'DDT_ALREADY_SENT');
    }
    if (existing.status !== DeliveryNoteStatus.GENERATED) {
      throw AppError.conflict('Solo un DDT generato può essere inviato', 'DDT_NOT_GENERATED');
    }
    const now = new Date();
    const updated = await tx.deliveryNote.update({
      where: { id: deliveryNoteId },
      data: { status: DeliveryNoteStatus.SENT, sentAt: now, updatedAt: now },
    });
    const items = await tx.deliveryNoteItem.findMany({ where: { deliveryNoteId } });

    // Phase 5a: shipping ⇒ money owed. Auto-create the sales invoice (idempotent per DDT).
    const alreadyInvoiced = await tx.salesInvoice.findFirst({
      where: { deliveryNoteId },
      select: { id: true },
    });
    if (!alreadyInvoiced) {
      const year = now.getFullYear();
      const lastInvoice = await tx.salesInvoice.findFirst({
        where: { companyId: existing.companyId, year },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      await tx.salesInvoice.create({
        data: {
          id: randomUUID(),
          companyId: existing.companyId,
          partnerId: existing.partnerId,
          deliveryNoteId,
          number: (lastInvoice?.number ?? 0) + 1,
          year,
          invoiceDate: now,
          dueDate: computeDueDate(now),
          totalAmount: computeInvoiceTotal(items),
          customerSnapshot: existing.customerSnapshot as unknown as Prisma.InputJsonValue,
          createdAt: now,
          updatedAt: now,
          items: {
            create: items.map((line) => ({
              id: randomUUID(),
              productId: line.productId,
              productName: line.productName,
              sku: line.sku,
              vintage: line.vintage,
              unitOfMeasure: line.unitOfMeasure,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              vatRate: line.vatRate,
              createdAt: now,
              updatedAt: now,
            })),
          },
        },
      });
    }

    return {
      deliveryNote: DeliveryNote.fromPrisma(updated),
      items: items.map(DeliveryNoteItem.fromPrisma),
    };
  });
}

/**
 * Atomically cancel a DDT: write compensating Stock IN movements (storno/rientro),
 * set the DDT to CANCELLED and restore the linked order to CONFIRMED.
 */
export async function cancelDeliveryNoteTx(
  prisma: PrismaClient,
  deliveryNoteId: string,
  reason: string | null,
): Promise<DeliveryNoteWithItems> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.deliveryNote.findUnique({ where: { id: deliveryNoteId } });
    if (!existing) {
      throw AppError.notFound('DDT non trovato', 'DDT_NOT_FOUND');
    }
    if (existing.status === DeliveryNoteStatus.CANCELLED) {
      throw AppError.conflict('DDT già annullato', 'DDT_ALREADY_CANCELLED');
    }

    const now = new Date();
    const outMovements = await tx.stock.findMany({
      where: { deliveryNoteId, type: 'OUT' },
    });
    for (const out of outMovements) {
      await tx.stock.create({
        data: {
          id: randomUUID(),
          productId: out.productId,
          quantity: Math.abs(out.quantity),
          unitOfMeasureQuantity: out.unitOfMeasureQuantity,
          price: out.price,
          unitOfMeasurePrice: out.unitOfMeasurePrice,
          type: 'IN',
          ddtCode: out.ddtCode,
          ddtDate: out.ddtDate,
          deliveryNoteId,
          notes: `Storno DDT ${existing.number}/${existing.year}${reason ? ` — ${reason}` : ''}`,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    const updatedNote = await tx.deliveryNote.update({
      where: { id: deliveryNoteId },
      data: {
        status: DeliveryNoteStatus.CANCELLED,
        cancelledAt: now,
        cancelReason: reason,
        updatedAt: now,
      },
    });

    if (existing.orderId) {
      await tx.salesOrder.update({
        where: { id: existing.orderId },
        data: { status: SalesOrderStatus.CONFIRMED },
      });
    }

    const items = await tx.deliveryNoteItem.findMany({ where: { deliveryNoteId } });
    return {
      deliveryNote: DeliveryNote.fromPrisma(updatedNote),
      items: items.map(DeliveryNoteItem.fromPrisma),
    };
  });
}
