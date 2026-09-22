import { PrismaClient } from '@prisma/client';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { findUserFields } from '../../tool/findUserFields';
import { DEFAULT_MAX_RESULTS } from './toolHelpers';
import { resolveCompanyId } from './tools.part-01-create-find-user-companies-tool';

/**
 * Creates the find user fields tool.
 */
export const createFindUserFieldsTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'find_user_fields',
    description:
      "Cerca i campi agricoli accessibili dall'utente corrente. Usa questo tool per trovare corrispondenze quando una nota menziona un campo specifico. Puoi filtrare per azienda specifica usando companyName (nome dell'azienda).",
    schema: z.object({
      searchTerm: z
        .string()
        .optional()
        .describe('Nome del campo da cercare (opzionale, cerca per nome parziale)'),
      companyName: z
        .string()
        .optional()
        .describe('Nome dell\'azienda per filtrare i campi (es: "azienda-demo", "rossi", etc.)'),
    }),
    func: async ({ searchTerm, companyName }) => {
      console.log(
        `${LOG_PREFIX.TOOL_FIND_FIELDS} Searching for:`,
        searchTerm || '(all fields)',
        'companyName:',
        companyName || '(any)',
      );
      const startTime = Date.now();

      try {
        // Resolve company name to ID
        const companyId = await resolveCompanyId(userId, companyName, prisma);

        const fields = await findUserFields({
          userId,
          searchTerm,
          companyId,
          prisma,
        });

        console.log(
          `${LOG_PREFIX.TOOL_FIND_FIELDS} Found ${fields.length} fields in ${Date.now() - startTime}ms`,
        );

        // If no matches found but we have a searchTerm and companyId, fetch ALL fields for that company
        // to show alternatives
        let alternativeFields: typeof fields = [];
        if (fields.length === 0 && searchTerm && companyId) {
          console.log(
            `${LOG_PREFIX.TOOL_FIND_FIELDS} No matches, fetching all fields for company as alternatives...`,
          );
          alternativeFields = await findUserFields({
            userId,
            searchTerm: undefined, // No filter - get all
            companyId,
            prisma,
          });
          console.log(
            `${LOG_PREFIX.TOOL_FIND_FIELDS} Found ${alternativeFields.length} alternative fields`,
          );
        }

        if (fields.length === 0 && alternativeFields.length === 0) {
          return FIELD_NOTE_MESSAGES.NO_FIELDS_FOUND(searchTerm, companyName);
        }

        // If we have alternatives but no direct matches
        if (fields.length === 0 && alternativeFields.length > 0) {
          return JSON.stringify(
            {
              matchFound: false,
              searchedFor: searchTerm,
              message: FIELD_NOTE_MESSAGES.FIELDS_NO_MATCH_ALTERNATIVES(searchTerm!),
              count: alternativeFields.length,
              availableFields: alternativeFields.slice(0, DEFAULT_MAX_RESULTS).map((f) => ({
                id: f.id,
                name: f.name,
                companyName: f.companyName,
                sauHa: f.sauHa,
                cropName: f.cropName,
                productionUnits: f.productionUnits?.map((pu) => pu.name),
              })),
            },
            null,
            2,
          );
        }

        return JSON.stringify(
          {
            matchFound: true,
            count: fields.length,
            fields: fields.map((f) => ({
              id: f.id,
              name: f.name,
              companyName: f.companyName,
              city: f.city,
              sauHa: f.sauHa,
              cropName: f.cropName,
              coordinates:
                f.latitude && f.longitude
                  ? {
                      latitude: f.latitude,
                      longitude: f.longitude,
                    }
                  : null,
              productionUnits: f.productionUnits,
            })),
          },
          null,
          2,
        );
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_FIND_FIELDS} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.SEARCH_FIELDS_FAILED(errorMessage));
      }
    },
  });
};
