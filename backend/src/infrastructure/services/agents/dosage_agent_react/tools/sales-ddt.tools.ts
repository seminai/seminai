import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaSalesOrderRepository } from '../../../../repositories/PrismaSalesOrderRepository';
import { PrismaDeliveryNoteRepository } from '../../../../repositories/PrismaDeliveryNoteRepository';
import { PrismaBusinessPartnerRepository } from '../../../../repositories/PrismaBusinessPartnerRepository';
import { PrismaProductRepository } from '../../../../repositories/PrismaProductRepository';
import { GenerateDeliveryNoteUseCase } from '../../../../../application/use-cases/delivery-note/GenerateDeliveryNoteUseCase';
import { CancelDeliveryNoteUseCase } from '../../../../../application/use-cases/delivery-note/CancelDeliveryNoteUseCase';
import { GetDeliveryNoteUseCase } from '../../../../../application/use-cases/delivery-note/GetDeliveryNoteUseCase';

function errorPayload(error: unknown): string {
  return JSON.stringify({ error: error instanceof Error ? error.message : 'Errore sconosciuto' });
}

/**
 * Tool: generate_ddt — generates a DDT from a confirmed order with atomic warehouse unload.
 * REQUIRES APPROVAL.
 */
export function createGenerateDdtTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'generate_ddt',
    description: `Genera un DDT (documento di trasporto) da un ordine CONFERMATO.
⚠️ RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Esegue lo scarico automatico del magazzino in modo ATOMICO (transazione): se la giacenza
è insufficiente, NON modifica il magazzino. Numerazione progressiva per azienda/anno e
snapshot storico dei dati cliente/prodotto.`,
    schema: z.object({
      orderId: z.string().describe('ID ordine confermato'),
      causale: z.string().optional().nullable().describe('Causale trasporto (default: Vendita)'),
      carrier: z.string().optional().nullable().describe('Vettore/corriere'),
      packagesCount: z.number().optional().nullable().describe('Numero colli'),
      estimatedWeightKg: z.number().optional().nullable().describe('Peso stimato (kg)'),
      deliveryNotesText: z.string().optional().nullable().describe('Note consegna'),
    }),
    func: async (args) => {
      try {
        const useCase = new GenerateDeliveryNoteUseCase(
          new PrismaSalesOrderRepository(prisma),
          new PrismaDeliveryNoteRepository(prisma),
          new PrismaBusinessPartnerRepository(prisma),
          new PrismaProductRepository(prisma),
        );
        const result = await useCase.execute(args);
        const ddt = result.deliveryNote;
        return JSON.stringify({
          deliveryNoteId: ddt.id,
          number: `${ddt.number}/${ddt.year}`,
          status: ddt.status,
          lines: result.items.length,
          message: `DDT ${ddt.number}/${ddt.year} generato. Magazzino scaricato per ${result.items.length} righe.`,
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}

/**
 * Tool: cancel_ddt — cancels a DDT and restores the warehouse (storno/rientro). REQUIRES APPROVAL.
 */
export function createCancelDdtTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'cancel_ddt',
    description: `Annulla un DDT eseguendo lo storno/rientro del magazzino (movimenti IN compensativi).
⚠️ RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE. Operazione idempotente: un DDT già annullato non viene toccato.`,
    schema: z.object({
      deliveryNoteId: z.string().describe('ID DDT da annullare'),
      reason: z.string().optional().nullable().describe('Motivo annullamento'),
    }),
    func: async ({ deliveryNoteId, reason }) => {
      try {
        const useCase = new CancelDeliveryNoteUseCase(new PrismaDeliveryNoteRepository(prisma));
        const result = await useCase.execute({ deliveryNoteId, reason });
        const ddt = result.deliveryNote;
        return JSON.stringify({
          deliveryNoteId: ddt.id,
          number: `${ddt.number}/${ddt.year}`,
          status: ddt.status,
          message: `DDT ${ddt.number}/${ddt.year} annullato. Giacenza ripristinata per ${result.items.length} righe.`,
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}

/**
 * Tool: get_ddt — fetches a DDT with its lines (read-only).
 */
export function createGetDdtTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_ddt',
    description: 'Recupera un DDT con le sue righe e lo snapshot del cliente.',
    schema: z.object({
      deliveryNoteId: z.string(),
    }),
    func: async ({ deliveryNoteId }) => {
      try {
        const useCase = new GetDeliveryNoteUseCase(new PrismaDeliveryNoteRepository(prisma));
        const result = await useCase.execute(deliveryNoteId);
        const ddt = result.deliveryNote;
        return JSON.stringify({
          deliveryNoteId: ddt.id,
          number: `${ddt.number}/${ddt.year}`,
          status: ddt.status,
          ddtDate: ddt.ddtDate,
          customer: ddt.customerSnapshot.name,
          items: result.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure,
          })),
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}
