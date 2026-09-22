import { type OrderSourceChannel, type OrderTemplatePreviewDto } from '../../../../../domain/dtos/standard-order.dto';
import { getWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import { ImportSalesOrderFromTemplateUseCase } from '../../../../../application/use-cases/sales-order/ImportSalesOrderFromTemplateUseCase';
import { PrismaProductRepository } from '../../../../repositories/PrismaProductRepository';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaBusinessPartnerRepository } from '../../../../repositories/PrismaBusinessPartnerRepository';
import { CreateSalesOrderUseCase } from '../../../../../application/use-cases/sales-order/CreateSalesOrderUseCase';
import { PrismaSalesOrderRepository } from '../../../../repositories/PrismaSalesOrderRepository';
import { CreateOrUpdatePartnerFromExtractionUseCase } from '../../../../../application/use-cases/business-partner/CreateOrUpdatePartnerFromExtractionUseCase';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { ConfirmSalesOrderUseCase } from '../../../../../application/use-cases/sales-order/ConfirmSalesOrderUseCase';
import { PrismaStockRepository } from '../../../../repositories/PrismaStockRepository';
import { SalesOrderStatus } from '@prisma/client';

export function errorPayload(error: unknown): string {
  return JSON.stringify({ error: error instanceof Error ? error.message : 'Errore sconosciuto' });
}

/** Reads the commercial provenance (channel + ingestion id) stamped by the email dispatch. */
export function readCommercialSource(threadId: string): { channel: OrderSourceChannel; ref: string } {
  const wm = getWorkingMemory(threadId);
  const source = wm.commercialSource as
    | { channel?: OrderSourceChannel; ingestionId?: string }
    | undefined;
  if (source?.channel) {
    const ref = source.ingestionId ? `${source.channel}:${source.ingestionId}` : source.channel;
    return { channel: source.channel, ref };
  }
  return { channel: 'chat', ref: 'template' };
}

export function buildImportTemplateUseCase(): ImportSalesOrderFromTemplateUseCase {
  const productRepository = new PrismaProductRepository(prisma);
  const partnerRepository = new PrismaBusinessPartnerRepository(prisma);
  return new ImportSalesOrderFromTemplateUseCase(
    productRepository,
    partnerRepository,
    new CreateSalesOrderUseCase(
      new PrismaSalesOrderRepository(prisma),
      productRepository,
      partnerRepository,
    ),
    new CreateOrUpdatePartnerFromExtractionUseCase(partnerRepository),
  );
}

export function readUploadedTemplate(threadId: string): { buffer: Buffer; fileName: string } | null {
  if (!hasWorkingMemoryData(threadId, 'uploadedFileBuffer')) return null;
  const wm = getWorkingMemory(threadId);
  const buffer = wm.uploadedFileBuffer as Buffer | undefined;
  if (!buffer) return null;
  return { buffer, fileName: (wm.uploadedFileName as string) || 'order-template.xlsx' };
}

export function toPreviewPayload(preview: OrderTemplatePreviewDto): Record<string, unknown> {
  return {
    customer: { name: preview.partner.name, matched: Boolean(preview.partner.matchedId) },
    lines: preview.lines.map((line) => ({
      product: line.productName,
      quantity: line.quantity,
      matched: Boolean(line.matchedProductId),
      warnings: line.warnings,
    })),
    warnings: preview.warnings,
    canCreate: preview.canCreate,
  };
}

/**
 * Tool: create_sales_order — creates a DRAFT customer order. REQUIRES APPROVAL.
 */
export function createCreateSalesOrderTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_sales_order',
    description: `Crea un ordine cliente in stato BOZZA con le sue righe.
⚠️ RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prezzo unitario e aliquota IVA, se omessi, vengono ereditati dal prodotto.
I totali (imponibile/IVA/totale) sono calcolati. La disponibilità è validata in conferma.`,
    schema: z.object({
      companyId: z.string().describe('ID azienda venditrice'),
      partnerId: z.string().describe('ID cliente (search_business_partners)'),
      items: z
        .array(
          z.object({
            productId: z.string(),
            quantity: z.number().positive(),
            unitPrice: z.number().optional().nullable(),
            discount: z.number().optional().nullable().describe('Sconto % (0–100)'),
            vatRate: z.number().optional().nullable().describe('Aliquota IVA %'),
          }),
        )
        .min(1)
        .describe('Righe ordine'),
      internalNotes: z.string().optional().nullable(),
      deliveryNotesText: z.string().optional().nullable(),
      sourceRef: z.string().optional().nullable().describe('Origine (email/file). Default: agent'),
    }),
    func: async (args) => {
      try {
        const useCase = new CreateSalesOrderUseCase(
          new PrismaSalesOrderRepository(prisma),
          new PrismaProductRepository(prisma),
          new PrismaBusinessPartnerRepository(prisma),
        );
        const result = await useCase.execute({ ...args, sourceRef: args.sourceRef ?? 'agent' });
        return JSON.stringify({
          orderId: result.order.order.id,
          status: result.order.order.status,
          lines: result.order.items.length,
          totals: result.totals,
          message: `Ordine creato (bozza) con ${result.order.items.length} righe. Totale € ${result.totals.total.toFixed(2)}.`,
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}

/**
 * Tool: confirm_sales_order — confirms an order, validating warehouse availability. REQUIRES APPROVAL.
 */
export function createConfirmSalesOrderTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'confirm_sales_order',
    description: `Conferma un ordine cliente validando la disponibilità di magazzino per ogni prodotto.
⚠️ RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Fallisce se la giacenza disponibile (al netto di quanto già riservato) è insufficiente.`,
    schema: z.object({
      orderId: z.string().describe('ID ordine da confermare'),
    }),
    func: async ({ orderId }) => {
      try {
        const useCase = new ConfirmSalesOrderUseCase(
          new PrismaSalesOrderRepository(prisma),
          new PrismaStockRepository(prisma),
        );
        const confirmed = await useCase.execute({ orderId });
        return JSON.stringify({
          orderId: confirmed.order.id,
          status: confirmed.order.status,
          message:
            'Ordine confermato. Disponibilità verificata; pronto per la generazione del DDT.',
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}

/**
 * Tool: list_sales_orders — lists a company's orders (read-only).
 */
export function createListSalesOrdersTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_sales_orders',
    description: "Elenca gli ordini di un'azienda, opzionalmente filtrati per stato.",
    schema: z.object({
      companyId: z.string(),
      status: z.nativeEnum(SalesOrderStatus).optional(),
    }),
    func: async ({ companyId, status }) => {
      try {
        const repo = new PrismaSalesOrderRepository(prisma);
        const orders = await repo.findManyByCompany(companyId, { status });
        return JSON.stringify({
          count: orders.length,
          orders: orders.map((entry) => ({
            orderId: entry.order.id,
            status: entry.order.status,
            partnerId: entry.order.partnerId,
            orderDate: entry.order.orderDate,
            lines: entry.items.length,
          })),
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}

/**
 * Tool: check_product_availability — returns the available balance of a product (read-only).
 */
export function createCheckProductAvailabilityTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'check_product_availability',
    description:
      'Restituisce la giacenza disponibile di un prodotto in magazzino prima di confermare un ordine.',
    schema: z.object({
      companyId: z.string(),
      productId: z.string(),
    }),
    func: async ({ companyId, productId }) => {
      try {
        const repo = new PrismaStockRepository(prisma);
        const available = await repo.getAvailableQuantity(productId, companyId);
        return JSON.stringify({ productId, available });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}
