import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaSalesOrderRepository } from '../../../../repositories/PrismaSalesOrderRepository';
import { PrismaProformaInvoiceRepository } from '../../../../repositories/PrismaProformaInvoiceRepository';
import { PrismaBusinessPartnerRepository } from '../../../../repositories/PrismaBusinessPartnerRepository';
import { PrismaProductRepository } from '../../../../repositories/PrismaProductRepository';
import { GenerateProformaUseCase } from '../../../../../application/use-cases/proforma/GenerateProformaUseCase';

function errorPayload(error: unknown): string {
  return JSON.stringify({ error: error instanceof Error ? error.message : 'Errore sconosciuto' });
}

/**
 * Tool: generate_proforma — generates a non-fiscal proforma invoice from a DRAFT or
 * CONFIRMED order. No warehouse impact, no order-status change. REQUIRES APPROVAL.
 */
export function createGenerateProformaTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'generate_proforma',
    description: `Genera una fattura proforma (documento NON fiscale) da un ordine in BOZZA o CONFERMATO.
⚠️ RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Non modifica il magazzino né lo stato dell'ordine. Numerazione progressiva per azienda/anno e snapshot storico del cliente.`,
    schema: z.object({
      orderId: z.string().describe('ID ordine (bozza o confermato)'),
      causale: z.string().optional().nullable().describe('Causale (default: Proforma)'),
      deliveryNotesText: z.string().optional().nullable().describe('Note'),
    }),
    func: async (args) => {
      try {
        const useCase = new GenerateProformaUseCase(
          new PrismaSalesOrderRepository(prisma),
          new PrismaProformaInvoiceRepository(prisma),
          new PrismaBusinessPartnerRepository(prisma),
          new PrismaProductRepository(prisma),
        );
        const result = await useCase.execute(args);
        const proforma = result.proformaInvoice;
        return JSON.stringify({
          proformaId: proforma.id,
          number: `${proforma.number}/${proforma.year}`,
          lines: result.items.length,
          message: `Proforma ${proforma.number}/${proforma.year} generata con ${result.items.length} righe.`,
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}
