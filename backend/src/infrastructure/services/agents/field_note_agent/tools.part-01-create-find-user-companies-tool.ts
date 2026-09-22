import { PrismaClient } from '@prisma/client';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { findUserCompanies } from '../../tool/findUserCompanies';
import { classifyFieldNoteData } from '../../tool/classifyFieldNoteData';

/**
 * Creates the find user companies tool.
 */
export const createFindUserCompaniesTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'find_user_companies',
    description:
      "Cerca le aziende agricole a cui l'utente corrente ha accesso. Usa questo tool per scoprire in quali aziende l'utente può operare, specialmente quando non trovi campi o unità produttive e devi chiedere all'utente di specificare l'azienda.",
    schema: z.object({
      searchTerm: z
        .string()
        .optional()
        .describe("Nome dell'azienda da cercare (opzionale, cerca per nome parziale)"),
    }),
    func: async ({ searchTerm }) => {
      console.log(
        `${LOG_PREFIX.TOOL_FIND_COMPANIES} Searching for:`,
        searchTerm || '(all companies)',
      );
      const startTime = Date.now();

      try {
        const companies = await findUserCompanies({
          userId,
          searchTerm,
          prisma,
        });

        console.log(
          `${LOG_PREFIX.TOOL_FIND_COMPANIES} Found ${companies.length} companies in ${Date.now() - startTime}ms`,
        );

        if (companies.length === 0) {
          return FIELD_NOTE_MESSAGES.NO_COMPANIES_FOUND(searchTerm);
        }

        return JSON.stringify(
          {
            count: companies.length,
            companies: companies.map((c) => ({
              id: c.id,
              name: c.name,
              fiscalCode: c.fiscalCode,
              vatNumber: c.vatNumber,
              city: c.city,
              cap: c.cap,
              userRole: c.userRole,
              fieldsCount: c.fieldsCount,
              productionUnitsCount: c.productionUnitsCount,
              warehousesCount: c.warehousesCount,
            })),
          },
          null,
          2,
        );
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_FIND_COMPANIES} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.SEARCH_COMPANIES_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Creates the classification tool for field notes.
 */
export const createClassifyFieldNoteDataTool = (openAIApiKey?: string) => {
  return new DynamicStructuredTool({
    name: 'classify_field_note_data',
    description:
      "Classifica il testo libero di una nota di campo ed estrae informazioni strutturate come categoria, prodotti menzionati, campo, quantità, osservazioni. Usa questo tool quando l'utente fornisce una nota di campo da analizzare.",
    schema: z.object({
      rawContent: z.string().describe('Il testo della nota di campo da classificare'),
      operationDate: z
        .string()
        .optional()
        .describe("Data dell'operazione se disponibile (ISO 8601)"),
    }),
    func: async ({ rawContent, operationDate }) => {
      console.log(
        `${LOG_PREFIX.TOOL_CLASSIFY} Starting classification for:`,
        rawContent.substring(0, 50),
      );
      const startTime = Date.now();

      try {
        const result = await classifyFieldNoteData({
          rawContent,
          operationDate,
          openAIApiKey,
        });

        console.log(`${LOG_PREFIX.TOOL_CLASSIFY} Completed in ${Date.now() - startTime}ms`);
        console.log(`${LOG_PREFIX.TOOL_CLASSIFY} Result category:`, result.category);

        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_CLASSIFY} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.CLASSIFICATION_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Helper function to resolve company name to ID.
 */
export async function resolveCompanyId(
  userId: string,
  companyNameOrId: string | undefined,
  prisma: PrismaClient,
): Promise<string | undefined> {
  if (!companyNameOrId) return undefined;

  // Check if it's already a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(companyNameOrId)) {
    return companyNameOrId;
  }

  // Search for company by name
  const userCompany = await prisma.userOnCompany.findFirst({
    where: {
      userId,
      company: {
        name: {
          contains: companyNameOrId,
          mode: 'insensitive',
        },
      },
    },
    include: {
      company: true,
    },
  });

  if (userCompany) {
    console.log(
      `${LOG_PREFIX.RESOLVE_COMPANY} Resolved "${companyNameOrId}" to ID: ${userCompany.company.id} (${userCompany.company.name})`,
    );
    return userCompany.company.id;
  }

  console.log(`${LOG_PREFIX.RESOLVE_COMPANY} Company "${companyNameOrId}" not found`);
  return undefined;
}
