import { DynamicStructuredTool } from '@langchain/core/tools';
import { CompanyKind } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaCompanyRepository } from '../../../../repositories/PrismaCompanyRepository';

/**
 * Tool: list_user_companies
 * Lists all companies accessible to the current user.
 *
 * When `kindFilter` is provided (e.g. a manufacturing workspace), only companies
 * of that kind are returned, so a manufacturing chat never surfaces agricultural
 * companies and vice versa.
 */
export function createListUserCompaniesTool(
  userId: string,
  kindFilter?: CompanyKind,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_user_companies',
    description: `Elenca le aziende associate all'utente corrente.
Non richiede parametri. Restituisce id, nome, comune, nazione e P.IVA di ogni azienda.
Usa questo tool come primo passo quando l'utente menziona "la mia azienda" o chiede informazioni sulle sue aziende.`,
    schema: z.object({}),
    func: async () => {
      try {
        const repo = new PrismaCompanyRepository(prisma);
        const allCompanies = await repo.findManyByUserId(userId);
        const companies = kindFilter
          ? allCompanies.filter((c) => c.kind === kindFilter)
          : allCompanies;

        const mapped = companies.map((c) => ({
          id: c.id,
          name: c.name,
          city: c.city,
          nation: c.nation,
          vatNumber: c.vatNumber,
        }));

        return JSON.stringify({
          companiesFound: mapped.length,
          companies: mapped,
          message:
            mapped.length === 0
              ? "Nessuna azienda trovata per l'utente corrente."
              : `Trovate ${mapped.length} azienda/e associate al tuo account.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
