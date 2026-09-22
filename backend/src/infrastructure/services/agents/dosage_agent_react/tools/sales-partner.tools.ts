import { DynamicStructuredTool } from '@langchain/core/tools';
import { PartnerType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaBusinessPartnerRepository } from '../../../../repositories/PrismaBusinessPartnerRepository';
import { CreateBusinessPartnerUseCase } from '../../../../../application/use-cases/business-partner/CreateBusinessPartnerUseCase';
import { SearchBusinessPartnersUseCase } from '../../../../../application/use-cases/business-partner/SearchBusinessPartnersUseCase';

function errorPayload(error: unknown): string {
  return JSON.stringify({ error: error instanceof Error ? error.message : 'Errore sconosciuto' });
}

/**
 * Tool: create_business_partner — creates a customer or supplier. REQUIRES APPROVAL.
 * Deduplicates on P.IVA / email / ragione sociale within the company + type.
 */
export function createCreateBusinessPartnerTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_business_partner',
    description: `Crea un cliente (CUSTOMER) o fornitore (SUPPLIER) nell'anagrafica.
⚠️ RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima ottieni companyId con list_user_companies e verifica i duplicati con search_business_partners.
La deduplicazione avviene automaticamente su P.IVA, email o ragione sociale.`,
    schema: z.object({
      companyId: z.string().describe('ID azienda venditrice (da list_user_companies)'),
      type: z.nativeEnum(PartnerType).describe('CUSTOMER (cliente) o SUPPLIER (fornitore)'),
      name: z.string().describe('Ragione sociale / nome'),
      vatNumber: z.string().optional().nullable().describe('Partita IVA'),
      fiscalCode: z.string().optional().nullable().describe('Codice fiscale'),
      sdiCode: z.string().optional().nullable().describe('Codice SDI'),
      pec: z.string().optional().nullable().describe('PEC'),
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      referent: z.string().optional().nullable().describe('Persona di riferimento'),
      address: z.string().optional().nullable().describe('Indirizzo sede legale'),
      city: z.string().optional().nullable(),
      cap: z.string().optional().nullable(),
      deliveryAddress: z.string().optional().nullable().describe('Indirizzo di consegna'),
      deliveryNotesText: z.string().optional().nullable().describe('Note consegna'),
      deliveryHours: z.string().optional().nullable().describe('Orari di consegna'),
    }),
    func: async (args) => {
      try {
        const repo = new PrismaBusinessPartnerRepository(prisma);
        const useCase = new CreateBusinessPartnerUseCase(repo);
        const result = await useCase.execute(args);
        return JSON.stringify({
          partnerId: result.partner.id,
          name: result.partner.name,
          type: result.partner.type,
          reused: result.reused,
          message: result.reused
            ? `Anagrafica "${result.partner.name}" già presente: riutilizzata senza duplicati.`
            : `Anagrafica "${result.partner.name}" creata con successo.`,
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}

/**
 * Tool: search_business_partners — looks up customers/suppliers (read-only).
 */
export function createSearchBusinessPartnersTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'search_business_partners',
    description: `Cerca o elenca clienti/fornitori di un'azienda. Usalo per recuperare i dati
di un cliente durante la creazione di un ordine/DDT, o per evitare duplicati prima di crearne uno.`,
    schema: z.object({
      companyId: z.string().describe('ID azienda (da list_user_companies)'),
      type: z.nativeEnum(PartnerType).optional().describe('Filtra per CUSTOMER o SUPPLIER'),
      query: z.string().optional().describe('Testo libero su nome / P.IVA / email'),
    }),
    func: async ({ companyId, type, query }) => {
      try {
        const repo = new PrismaBusinessPartnerRepository(prisma);
        const useCase = new SearchBusinessPartnersUseCase(repo);
        const partners = await useCase.execute({ companyId, type, query });
        return JSON.stringify({
          count: partners.length,
          partners: partners.map((partner) => ({
            partnerId: partner.id,
            name: partner.name,
            type: partner.type,
            vatNumber: partner.vatNumber,
            email: partner.email,
            isActive: partner.isActive,
          })),
        });
      } catch (error) {
        return errorPayload(error);
      }
    },
  });
}
