import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { ProformaInvoice } from '../../domain/entities/ProformaInvoice';
import { ProformaInvoiceItem } from '../../domain/entities/ProformaInvoiceItem';
import {
  GenerateProformaInvoiceRepoInput,
  ProformaInvoiceWithItems,
} from '../../domain/repositories/IProformaInvoiceRepository';

/**
 * Atomically generate a proforma: assign the progressive number per (companyId, year)
 * and create header + lines. NO warehouse movements and NO order-status change —
 * a proforma is a non-fiscal document. Any failure rolls back the whole transaction.
 */
export async function generateProformaInvoiceTx(
  prisma: PrismaClient,
  input: GenerateProformaInvoiceRepoInput,
): Promise<ProformaInvoiceWithItems> {
  return prisma.$transaction(async (tx) => {
    const last = await tx.proformaInvoice.findFirst({
      where: { companyId: input.companyId, year: input.year },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const number = (last?.number ?? 0) + 1;
    const now = new Date();
    const proformaId = randomUUID();

    const created = await tx.proformaInvoice.create({
      data: {
        id: proformaId,
        companyId: input.companyId,
        partnerId: input.partnerId,
        orderId: input.orderId,
        number,
        year: input.year,
        proformaDate: input.proformaDate,
        causale: input.causale,
        deliveryNotesText: input.deliveryNotesText,
        customerSnapshot: input.customerSnapshot as unknown as Prisma.InputJsonValue,
        createdAt: now,
        updatedAt: now,
      },
    });

    const createdItems = [];
    for (const line of input.lines) {
      const item = await tx.proformaInvoiceItem.create({
        data: {
          id: randomUUID(),
          proformaInvoiceId: proformaId,
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
    }

    return {
      proformaInvoice: ProformaInvoice.fromPrisma(created),
      items: createdItems.map(ProformaInvoiceItem.fromPrisma),
    };
  });
}
