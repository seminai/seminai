import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaFieldRepository } from '../../../../repositories/PrismaFieldRepository';
import { updateWorkingMemory } from '../working-memory';

/**
 * Tool: list_user_fields
 * Lists fields (parcelle) for the current user with cadastral data, area, and land use.
 * Saves full data to working memory and returns a compact index to the LLM.
 */
export function createListUserFieldsTool(threadId: string, userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_user_fields',
    description: `Elenca i campi (parcelle) dell'utente con dati catastali, superficie e uso del suolo.
Parametri opzionali: companyId per filtrare per azienda.
Usa questo tool per trovare i fieldId necessari a create_production_units.
Restituisce un indice compatto; dati completi salvati in working memory (userFields).
Usa get_working_memory_details(key: "userFields") per accedere a tutti i dettagli.`,
    schema: z.object({
      companyId: z
        .string()
        .optional()
        .describe('Filtra per ID azienda specifica. Se omesso, mostra tutti i campi.'),
    }),
    func: async ({ companyId }) => {
      try {
        const repo = new PrismaFieldRepository(prisma);

        const fields = companyId
          ? await repo.findManyByCompanyId(companyId)
          : await repo.findManyByUserId(userId);

        const mapped = fields.map((f) => ({
          id: f.id,
          name: f.name,
          companyId: f.companyId,
          companyName: f.companyName ?? null,
          sezione: f.sezione,
          foglio: f.foglio,
          particella: f.particella,
          subalterno: f.subalterno,
          superficieCatastaleMq: f.superficieCatastaleMq,
          sauHa: f.sauHa,
          gisHa: f.gisHa,
          uso: f.uso,
          city: f.city,
          region: f.region,
          address: f.address,
        }));

        // Save full data to working memory
        updateWorkingMemory(threadId, { userFields: mapped });

        // Return compact INDEX to the LLM
        return JSON.stringify({
          fieldsFound: mapped.length,
          fieldIndex: mapped.slice(0, 15).map((f, i) => ({
            idx: i,
            name: f.name,
            company: f.companyName,
            sauHa: f.sauHa,
            city: f.city,
          })),
          workingMemoryKey: 'userFields',
          message:
            mapped.length === 0
              ? "Nessun campo trovato per l'utente corrente."
              : `Trovati ${mapped.length} campo/i. Dati completi in working memory. Usa get_working_memory_details per dettagli.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
