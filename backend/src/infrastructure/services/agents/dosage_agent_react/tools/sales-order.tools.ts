import { DynamicStructuredTool } from '@langchain/core/tools';
import { SalesOrderStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaSalesOrderRepository } from '../../../../repositories/PrismaSalesOrderRepository';
import { PrismaBusinessPartnerRepository } from '../../../../repositories/PrismaBusinessPartnerRepository';
import { PrismaProductRepository } from '../../../../repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../../../../repositories/PrismaStockRepository';
import { CreateSalesOrderUseCase } from '../../../../../application/use-cases/sales-order/CreateSalesOrderUseCase';
import { ConfirmSalesOrderUseCase } from '../../../../../application/use-cases/sales-order/ConfirmSalesOrderUseCase';
import { ImportSalesOrderFromTemplateUseCase } from '../../../../../application/use-cases/sales-order/ImportSalesOrderFromTemplateUseCase';
import { CreateOrUpdatePartnerFromExtractionUseCase } from '../../../../../application/use-cases/business-partner/CreateOrUpdatePartnerFromExtractionUseCase';
import {
  type OrderSourceChannel,
  type OrderTemplatePreviewDto,
} from '../../../../../domain/dtos/standard-order.dto';
import { getWorkingMemory, hasWorkingMemoryData } from '../working-memory';

function errorPayload(error: unknown): string {
  return JSON.stringify({ error: error instanceof Error ? error.message : 'Errore sconosciuto' });
}

/** Reads the commercial provenance (channel + ingestion id) stamped by the email dispatch. */
function readCommercialSource(threadId: string): { channel: OrderSourceChannel; ref: string } {
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

function buildImportTemplateUseCase(): ImportSalesOrderFromTemplateUseCase {
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

function readUploadedTemplate(threadId: string): { buffer: Buffer; fileName: string } | null {
  if (!hasWorkingMemoryData(threadId, 'uploadedFileBuffer')) return null;
  const wm = getWorkingMemory(threadId);
  const buffer = wm.uploadedFileBuffer as Buffer | undefined;
  if (!buffer) return null;
  return { buffer, fileName: (wm.uploadedFileName as string) || 'order-template.xlsx' };
}

function toPreviewPayload(preview: OrderTemplatePreviewDto): Record<string, unknown> {
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

/**
 * Tool: preview_order_template — parses the attached order template and shows a
 * normalized, resolved preview. Read-only (no persistence).
 */
export function createPreviewOrderTemplateTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'preview_order_template',
    description: `Legge il MODELLO ordine Excel allegato (colonne fisse: Prodotto | Annata | Quantità | Prezzo unitario, più "Nome cliente" e "P.IVA") e mostra un'anteprima normalizzata.
NON crea nulla: abbina cliente e prodotti all'anagrafica e indica se l'ordine è creabile (canCreate).
Usa SEMPRE questo strumento prima di import_sales_order_from_template, e mostra l'anteprima all'utente.`,
    schema: z.object({
      companyId: z.string().describe('ID azienda venditrice'),
    }),
    func: async ({ companyId }) => {
      try {
        const file = readUploadedTemplate(threadId);
        if (!file) {
          return JSON.stringify({
            error: 'Nessun file caricato.',
            hint: "L'utente deve allegare il modello ordine .xlsx.",
          });
        }
        const preview = await buildImportTemplateUseCase().preview({
          fileBuffer: file.buffer,
          fileName: file.fileName,
          companyId,
          sourceChannel: 'chat',
        });
        return JSON.stringify(toPreviewPayload(preview));
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}

/**
 * Tool: import_sales_order_from_template — creates a DRAFT order from the attached
 * template once customer + products resolve. REQUIRES APPROVAL.
 */
export function createImportSalesOrderFromTemplateTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'import_sales_order_from_template',
    description: `Crea un ordine cliente in BOZZA a partire dal MODELLO Excel allegato.
⚠️ RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Abbina cliente e prodotti all'anagrafica. Se il cliente non è in anagrafica usa search_business_partners / create_business_partner, poi richiama questo strumento passando partnerId.
Se cliente o prodotti non sono risolti, restituisce l'anteprima senza creare nulla.`,
    schema: z.object({
      companyId: z.string().describe('ID azienda venditrice'),
      partnerId: z.string().optional().nullable().describe('ID cliente già risolto (opzionale)'),
    }),
    func: async ({ companyId, partnerId }) => {
      try {
        const file = readUploadedTemplate(threadId);
        if (!file) {
          return JSON.stringify({ error: 'Nessun file caricato.' });
        }
        const useCase = buildImportTemplateUseCase();
        const preview = await useCase.preview({
          fileBuffer: file.buffer,
          fileName: file.fileName,
          companyId,
          sourceChannel: 'chat',
        });
        const resolvedPartnerId = partnerId ?? preview.partner.matchedId ?? undefined;
        const linesCreatable =
          preview.lines.length > 0 &&
          preview.lines.every(
            (line) => line.matchedProductId && !line.warnings.includes('PRODUCT_INACTIVE'),
          );
        if (!linesCreatable) {
          return JSON.stringify({
            created: false,
            ...toPreviewPayload(preview),
            message: 'Anteprima pronta — risolvi i prodotti mancanti prima di creare.',
          });
        }
        const source = readCommercialSource(threadId);
        const result = await useCase.commit({
          companyId,
          partnerId: resolvedPartnerId,
          customerName: preview.standardOrder.customerName,
          customerVat: preview.standardOrder.customerVat,
          lines: preview.lines,
          deliveryNotesText: preview.standardOrder.deliveryNotesText,
          sourceChannel: source.channel,
          sourceRef: source.ref,
        });
        return JSON.stringify({
          created: true,
          orderId: result.order.order.id,
          status: result.order.order.status,
          lines: result.order.items.length,
          totals: result.totals,
          message: `Ordine importato (bozza) con ${result.order.items.length} righe. Totale € ${result.totals.total.toFixed(2)}.`,
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}
