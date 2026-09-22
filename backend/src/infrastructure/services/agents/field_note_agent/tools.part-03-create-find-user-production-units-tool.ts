import { PrismaClient } from '@prisma/client';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { findUserProductionUnits } from '../../tool/findUserProductionUnits';
import { DEFAULT_MAX_RESULTS } from './toolHelpers';
import { resolveCompanyId } from './tools.part-01-create-find-user-companies-tool';

/**
 * Creates the find user production units tool.
 */
export const createFindUserProductionUnitsTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'find_user_production_units',
    description:
      "Cerca le unità produttive accessibili dall'utente corrente. Usa questo tool per trovare corrispondenze quando una nota menziona una coltura o unità produttiva specifica. Puoi filtrare per azienda specifica usando companyName (nome dell'azienda).",
    schema: z.object({
      cropName: z
        .string()
        .optional()
        .describe('Nome della coltura da cercare (opzionale, cerca per nome parziale)'),
      companyName: z
        .string()
        .optional()
        .describe(
          'Nome dell\'azienda per filtrare le unità produttive (es: "azienda-demo", "rossi", etc.)',
        ),
    }),
    func: async ({ cropName, companyName }) => {
      console.log(
        `${LOG_PREFIX.TOOL_FIND_PU} Searching for crop:`,
        cropName || '(all)',
        'companyName:',
        companyName || '(any)',
      );
      const startTime = Date.now();

      try {
        // Resolve company name to ID
        const companyId = await resolveCompanyId(userId, companyName, prisma);

        const productionUnits = await findUserProductionUnits({
          userId,
          cropName,
          companyId,
          prisma,
        });

        console.log(
          `${LOG_PREFIX.TOOL_FIND_PU} Found ${productionUnits.length} units in ${Date.now() - startTime}ms`,
        );

        // If no matches found but we have a cropName and companyId, fetch ALL PUs for that company
        let alternativePUs: typeof productionUnits = [];
        if (productionUnits.length === 0 && cropName && companyId) {
          console.log(
            `${LOG_PREFIX.TOOL_FIND_PU} No matches, fetching all PUs for company as alternatives...`,
          );
          alternativePUs = await findUserProductionUnits({
            userId,
            cropName: undefined, // No filter - get all
            companyId,
            prisma,
          });
          console.log(`${LOG_PREFIX.TOOL_FIND_PU} Found ${alternativePUs.length} alternative PUs`);
        }

        if (productionUnits.length === 0 && alternativePUs.length === 0) {
          return FIELD_NOTE_MESSAGES.NO_PRODUCTION_UNITS_FOUND(cropName, companyName);
        }

        // If we have alternatives but no direct matches
        if (productionUnits.length === 0 && alternativePUs.length > 0) {
          return JSON.stringify(
            {
              matchFound: false,
              searchedFor: cropName,
              message: FIELD_NOTE_MESSAGES.PRODUCTION_UNITS_NO_MATCH_ALTERNATIVES(cropName!),
              count: alternativePUs.length,
              availableProductionUnits: alternativePUs.slice(0, DEFAULT_MAX_RESULTS).map((pu) => ({
                id: pu.id,
                name: pu.name,
                areaHa: pu.areaHa,
                cropName: pu.cropName,
                variety: pu.variety,
                fields: pu.fields?.map((f) => ({
                  id: f.id,
                  name: f.name,
                  companyId: f.companyId,
                  companyName: f.companyName,
                })),
              })),
            },
            null,
            2,
          );
        }

        return JSON.stringify(
          {
            matchFound: true,
            count: productionUnits.length,
            productionUnits: productionUnits.map((pu) => ({
              id: pu.id,
              name: pu.name,
              areaHa: pu.areaHa,
              cropName: pu.cropName,
              cropType: pu.cropType,
              variety: pu.variety,
              seasonYear: pu.seasonYear,
              fields: pu.fields.map((f) => ({
                id: f.id,
                name: f.name,
                companyId: f.companyId,
                companyName: f.companyName,
                areaHaOnField: f.areaHaOnField,
              })),
            })),
          },
          null,
          2,
        );
      } catch (error) {
        console.error(`${LOG_PREFIX.TOOL_FIND_PU} Error after ${Date.now() - startTime}ms:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.SEARCH_PRODUCTION_UNITS_FAILED(errorMessage));
      }
    },
  });
};
