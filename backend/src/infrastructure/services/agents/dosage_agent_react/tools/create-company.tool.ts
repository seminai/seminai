import { DynamicStructuredTool } from '@langchain/core/tools';
import { CompanyRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaCompanyRepository } from '../../../../repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../../../../repositories/PrismaUserOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../../../../repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../../../repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../../../../repositories/PrismaCompanyOnWorkspaceRepository';
import { CreateCompanyUseCase } from '../../../../../application/use-cases/company/CreateCompanyUseCase';
import { UserOnCompany } from '../../../../../domain/entities/UserOnCompany';
import { updateWorkingMemory } from '../working-memory';

async function attachUserToCompanyIfNeeded(
  companyId: string,
  userId: string,
  userOnCompanyRepo: PrismaUserOnCompanyRepository,
): Promise<void> {
  const existingMembership = await userOnCompanyRepo.findByCompanyAndUser(companyId, userId);
  if (existingMembership) {
    return;
  }
  await userOnCompanyRepo.create(
    UserOnCompany.create({
      companyId,
      userId,
      type: null,
      role: CompanyRole.ADMIN,
    }),
  );
}

/**
 * Tool: create_company
 * Creates a new company (azienda) in the system. REQUIRES USER APPROVAL.
 */
export function createCreateCompanyTool(threadId: string, userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_company',
    description: `Crea una nuova azienda nel sistema.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare questo tool, DEVI presentare un riepilogo con:
- Nome azienda, P.IVA, Codice Fiscale, Comune
L'utente deve confermare prima che l'azienda venga creata.
Verifica prima con list_user_companies che l'azienda non esista già.
Salva l'ID dell'azienda creata in working memory (createdCompanyId) per i tool successivi.`,
    schema: z.object({
      name: z.string().describe('Nome azienda / ragione sociale'),
      vatNumber: z.string().describe('Partita IVA (11 cifre)'),
      fiscalCode: z.string().describe('Codice fiscale (11-16 caratteri alfanumerici)'),
      cuaa: z.string().optional().nullable().describe('CUAA (se diverso da CF)'),
      nation: z.string().optional().default('IT').describe('Nazione (default IT)'),
      city: z.string().optional().nullable().describe('Comune'),
      address: z.string().optional().nullable().describe('Indirizzo sede'),
      cap: z.string().optional().nullable().describe('CAP'),
      email: z.string().optional().nullable().describe('Email aziendale'),
      phoneNumber: z.string().optional().nullable().describe('Telefono'),
    }),
    func: async ({
      name,
      vatNumber,
      fiscalCode,
      cuaa,
      nation,
      city,
      address,
      cap,
      email,
      phoneNumber,
    }) => {
      try {
        const companyRepo = new PrismaCompanyRepository(prisma);
        const userOnCompanyRepo = new PrismaUserOnCompanyRepository(prisma);
        const existingCompany =
          (await companyRepo.findByVatNumber(vatNumber)) ??
          (await companyRepo.findByFiscalCode(fiscalCode));
        if (existingCompany) {
          await attachUserToCompanyIfNeeded(existingCompany.id, userId, userOnCompanyRepo);
          updateWorkingMemory(threadId, { createdCompanyId: existingCompany.id });
          return JSON.stringify({
            companyId: existingCompany.id,
            name: existingCompany.name,
            vatNumber: existingCompany.vatNumber,
            fiscalCode: existingCompany.fiscalCode,
            city: existingCompany.city,
            reusedExistingCompany: true,
            workingMemoryKey: 'createdCompanyId',
            message: `Azienda "${existingCompany.name}" già presente. Riutilizzata senza creare duplicati.`,
          });
        }
        const workspaceRepo = new PrismaWorkspaceRepository(prisma);
        const workspaceMemberRepo = new PrismaWorkspaceMemberRepository(prisma);
        const companyOnWorkspaceRepo = new PrismaCompanyOnWorkspaceRepository(prisma);
        const useCase = new CreateCompanyUseCase(
          companyRepo,
          userOnCompanyRepo,
          workspaceRepo,
          workspaceMemberRepo,
          companyOnWorkspaceRepo,
        );
        const { company } = await useCase.execute({
          name,
          vatNumber,
          fiscalCode,
          cuaa: cuaa ?? null,
          nation: nation ?? 'IT',
          city: city ?? null,
          address: address ?? null,
          cap: cap ?? null,
          email: email ?? null,
          phoneNumber: phoneNumber ?? null,
          website: null,
          logoUrl: null,
          userId,
        });

        updateWorkingMemory(threadId, { createdCompanyId: company.id });

        return JSON.stringify({
          companyId: company.id,
          name: company.name,
          vatNumber: company.vatNumber,
          fiscalCode: company.fiscalCode,
          city: company.city,
          workingMemoryKey: 'createdCompanyId',
          message: `Azienda "${company.name}" creata con successo. L'utente è stato assegnato come ADMIN.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
