import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  PrismaClient,
  ProductCategory,
  FieldNoteCategory,
  FieldNoteProcessingStatus,
} from '@prisma/client';
import { classifyFieldNoteData } from '../../tool/classifyFieldNoteData';
import { findUserCompanies } from '../../tool/findUserCompanies';
import { findUserFields } from '../../tool/findUserFields';
import { findUserProductionUnits } from '../../tool/findUserProductionUnits';
import { findUserProducts } from '../../tool/findUserProducts';
import { saveFieldNote, SaveFieldNoteSchema } from '../../tool/saveFieldNote';
import { saveStockInPurchase, SaveStockInPurchaseSchema } from '../../tool/saveStockInPurchase';
import { saveStockInHarvest, SaveStockInHarvestSchema } from '../../tool/saveStockInHarvest';
import { saveStockOutSale, SaveStockOutSaleSchema } from '../../tool/saveStockOutSale';
import {
  saveStockOutTreatment,
  SaveStockOutTreatmentSchema,
} from '../../tool/saveStockOutTreatment';
import { extractGpsFromImage } from '../../tool/extractGpsFromImage';
import { countUserFieldNotes } from '../../tool/countUserFieldNotes';
import { listUserFieldNotes } from '../../tool/listUserFieldNotes';
import { getUserFieldNoteById } from '../../tool/getUserFieldNoteById';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { DEFAULT_MAX_RESULTS } from './toolHelpers';

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
async function resolveCompanyId(
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

/**
 * Creates the find user products tool.
 */
export const createFindUserProductsTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'find_user_products',
    description:
      "Cerca i prodotti (fitofarmaci, fertilizzanti, sementi, etc.) nei magazzini accessibili dall'utente corrente. Usa questo tool per trovare corrispondenze quando una nota menziona un prodotto specifico. Puoi filtrare per azienda specifica usando companyName (nome dell'azienda).",
    schema: z.object({
      searchTerm: z
        .string()
        .optional()
        .describe('Nome del prodotto da cercare (opzionale, cerca per nome parziale)'),
      category: z
        .enum(['FERTILIZER', 'PESTICIDE', 'SEED', 'HARVEST', 'EQUIPMENT', 'PACKAGING'])
        .optional()
        .describe('Categoria del prodotto (opzionale)'),
      companyName: z
        .string()
        .optional()
        .describe('Nome dell\'azienda per filtrare i prodotti (es: "azienda-demo", "rossi", etc.)'),
    }),
    func: async ({ searchTerm, category, companyName }) => {
      console.log(
        `${LOG_PREFIX.TOOL_FIND_PRODUCTS} Searching for:`,
        searchTerm || '(all)',
        'category:',
        category || '(any)',
        'companyName:',
        companyName || '(any)',
      );
      const startTime = Date.now();

      try {
        // Resolve company name to ID
        const companyId = await resolveCompanyId(userId, companyName, prisma);

        const products = await findUserProducts({
          userId,
          searchTerm,
          category: category as ProductCategory | undefined,
          companyId,
          prisma,
        });

        console.log(
          `${LOG_PREFIX.TOOL_FIND_PRODUCTS} Found ${products.length} products in ${Date.now() - startTime}ms`,
        );

        if (products.length === 0) {
          return FIELD_NOTE_MESSAGES.NO_PRODUCTS_FOUND(searchTerm, category);
        }

        return JSON.stringify(
          {
            count: products.length,
            products: products.map((p) => ({
              id: p.id,
              name: p.name,
              category: p.category,
              type: p.type,
              registrationNumber: p.registrationNumber,
              warehouseName: p.warehouseName,
              totalAvailableQuantity: p.totalAvailableQuantity,
              recentStocks: p.recentStocks.slice(0, 3).map((s) => ({
                quantity: s.quantity,
                unit: s.unitOfMeasureQuantity,
                type: s.type,
                date: s.createdAt,
              })),
            })),
          },
          null,
          2,
        );
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_FIND_PRODUCTS} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.SEARCH_PRODUCTS_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Creates the save field note tool.
 */
export const createSaveFieldNoteTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'save_field_note',
    description:
      'Salva definitivamente una nota di campo classificata nel database dopo conferma dell\'utente. IMPORTANTE: fieldId è OBBLIGATORIO - devi sempre determinare il campo prima di salvare. Usa questo tool SOLO dopo che l\'utente ha esplicitamente confermato i dati (con "ok", "sì", "conferma", "salva", etc.).',
    schema: SaveFieldNoteSchema,
    func: async (input) => {
      console.log(`${LOG_PREFIX.TOOL_SAVE} Saving field note with category:`, input.category);
      const startTime = Date.now();

      // Validation: warn if fieldId is missing
      if (!input.fieldId) {
        console.warn(
          `${LOG_PREFIX.TOOL_SAVE} WARNING: fieldId is missing! The agent should always determine the field before saving.`,
        );
        console.warn(`${LOG_PREFIX.TOOL_SAVE} Provided data:`, {
          category: input.category,
          fieldId: input.fieldId,
          productionUnitId: input.productionUnitId,
          rawContent: input.rawContent?.substring(0, 50),
        });
      }

      try {
        const result = await saveFieldNote(userId, prisma, input);
        console.log(
          `${LOG_PREFIX.TOOL_SAVE} Saved successfully in ${Date.now() - startTime}ms, ID:`,
          result.fieldNoteId,
        );

        // Add warning to result if fieldId was missing
        if (!input.fieldId) {
          return JSON.stringify(
            {
              ...result,
              warning: FIELD_NOTE_MESSAGES.SAVE_WITHOUT_FIELD_WARNING,
            },
            null,
            2,
          );
        }

        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(`${LOG_PREFIX.TOOL_SAVE} Error after ${Date.now() - startTime}ms:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.SAVE_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Creates the stock-in purchase tool.
 */
export const createSaveStockInPurchaseTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'save_stock_in_purchase',
    description:
      'Registra un carico a magazzino (Stock IN) da un acquisto. ' +
      "Funziona sia con descrizione testuale (es. 'ho comprato 30 kg di Rame, DDT 123 del 12/02') " +
      'sia con documenti allegati (DDT, fattura, etichetta). ' +
      'Crea il prodotto se non esiste e registra il movimento di carico. ' +
      "IMPORTANTE: Devi prima determinare l'azienda (companyId) usando find_user_companies. " +
      'Cerca il prodotto con find_user_products per verificare se esiste già. ' +
      "Usa questo tool SOLO dopo conferma esplicita dell'utente.",
    schema: SaveStockInPurchaseSchema,
    func: async (input) => {
      console.log(
        `${LOG_PREFIX.TOOL_STOCK_IN_PURCHASE} Saving stock in purchase for product:`,
        input.productName,
      );
      const startTime = Date.now();

      try {
        const result = await saveStockInPurchase(userId, prisma, input);
        console.log(
          `${LOG_PREFIX.TOOL_STOCK_IN_PURCHASE} Completed in ${Date.now() - startTime}ms, stockId:`,
          result.stockId,
        );
        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_STOCK_IN_PURCHASE} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.STOCK_SAVE_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Creates the stock-in harvest tool.
 */
export const createSaveStockInHarvestTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'save_stock_in_harvest',
    description:
      'Registra un carico a magazzino da raccolta (Stock IN HARVEST). ' +
      'Crea un prodotto di tipo HARVEST se non esiste e registra il raccolto come ingresso a magazzino. ' +
      "Usa questo tool quando l'utente dice di aver raccolto una coltura dal campo. " +
      'IMPORTANTE: Devi prima determinare azienda, campo e unità produttiva usando ' +
      'find_user_companies, find_user_fields e find_user_production_units. ' +
      "Usa questo tool SOLO dopo conferma esplicita dell'utente.",
    schema: SaveStockInHarvestSchema,
    func: async (input) => {
      console.log(
        `${LOG_PREFIX.TOOL_STOCK_IN_HARVEST} Saving harvest stock in for crop:`,
        input.cropName,
      );
      const startTime = Date.now();

      try {
        const result = await saveStockInHarvest(userId, prisma, input);
        console.log(
          `${LOG_PREFIX.TOOL_STOCK_IN_HARVEST} Completed in ${Date.now() - startTime}ms, stockId:`,
          result.stockId,
        );
        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_STOCK_IN_HARVEST} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.STOCK_SAVE_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Creates the stock-out sale tool.
 */
export const createSaveStockOutSaleTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'save_stock_out_sale',
    description:
      'Registra uno scarico da magazzino per vendita (Stock OUT). ' +
      'Verifica la disponibilità del prodotto e registra il movimento di vendita. ' +
      "Usa questo tool quando l'utente dice di aver venduto un prodotto dal magazzino. " +
      'IMPORTANTE: Il prodotto DEVE esistere in magazzino - usa find_user_products prima per trovarlo ' +
      "e verificare la disponibilità. Se la disponibilità è insufficiente, avvisa l'utente prima di procedere. " +
      "Usa questo tool SOLO dopo conferma esplicita dell'utente.",
    schema: SaveStockOutSaleSchema,
    func: async (input) => {
      console.log(
        `${LOG_PREFIX.TOOL_STOCK_OUT_SALE} Saving stock out sale for product:`,
        input.productId,
      );
      const startTime = Date.now();

      try {
        const result = await saveStockOutSale(userId, prisma, input);
        console.log(
          `${LOG_PREFIX.TOOL_STOCK_OUT_SALE} Completed in ${Date.now() - startTime}ms, stockId:`,
          result.stockId,
        );
        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_STOCK_OUT_SALE} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.STOCK_SAVE_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Creates the stock-out treatment tool.
 */
export const createSaveStockOutTreatmentTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'save_stock_out_treatment',
    description:
      'Registra una nota di campo di trattamento e uno scarico da magazzino (Stock OUT) per consumo prodotto. ' +
      "Usa questo tool quando l'utente dice di aver dato, applicato, distribuito, trattato o usato un prodotto in campo. " +
      'NON usare per acquisti/carichi: per "comprato", "acquistato", "ricevuto" usa save_stock_in_purchase. ' +
      'Il prodotto DEVE esistere in magazzino: usa find_user_products prima per ottenere productId e disponibilita. ' +
      "Il campo e l'unita produttiva sono obbligatori: usa find_user_fields e find_user_production_units. " +
      'Se manca la quantita numerica, chiedi chiarimento prima di usare questo tool. ' +
      'Se la disponibilita e insufficiente, salva comunque e il tool restituira un warning.',
    schema: SaveStockOutTreatmentSchema,
    func: async (input) => {
      console.log(
        `${LOG_PREFIX.TOOL_STOCK_OUT_TREATMENT} Saving stock out treatment for product:`,
        input.productId,
      );
      const startTime = Date.now();

      try {
        const result = await saveStockOutTreatment(userId, prisma, input);
        console.log(
          `${LOG_PREFIX.TOOL_STOCK_OUT_TREATMENT} Completed in ${Date.now() - startTime}ms, stockId:`,
          result.stockId,
        );
        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_STOCK_OUT_TREATMENT} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.STOCK_SAVE_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Creates the extract GPS from image tool.
 */
export const createExtractGpsFromImageTool = () => {
  return new DynamicStructuredTool({
    name: 'extract_gps_from_image',
    description:
      "Estrae le coordinate GPS e metadati EXIF da un'immagine allegata. " +
      "Usa questo tool quando l'utente allega una foto e vuoi determinare dove è stata scattata. " +
      "Accetta l'URL dell'immagine già caricata (Attachment URL). " +
      'Restituisce latitudine, longitudine, altitudine e data dello scatto. ' +
      'NOTA: Funziona solo con immagini JPEG/HEIC originali, non con PNG o immagini modificate.',
    schema: z.object({
      fileUrl: z
        .string()
        .describe("URL dell'immagine da analizzare (Attachment URL dal messaggio dell'utente)"),
    }),
    func: async ({ fileUrl }) => {
      console.log(
        `${LOG_PREFIX.TOOL_EXTRACT_GPS} Extracting GPS from image:`,
        fileUrl.substring(0, 80),
      );
      const startTime = Date.now();

      try {
        const result = await extractGpsFromImage(fileUrl);

        console.log(
          `${LOG_PREFIX.TOOL_EXTRACT_GPS} Completed in ${Date.now() - startTime}ms, GPS found: ${result.gpsFound}`,
        );

        if (result.gpsFound) {
          console.log(
            `${LOG_PREFIX.TOOL_EXTRACT_GPS} Coordinates: ${result.latitude}, ${result.longitude}`,
          );
        }

        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_EXTRACT_GPS} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(FIELD_NOTE_MESSAGES.GPS_EXTRACTION_FAILED(errorMessage));
      }
    },
  });
};

/**
 * Tool: count_user_field_notes
 * Returns the total number of field notes registered by the user plus a
 * breakdown by processing status. Read-only, no approval required.
 */
export const createCountUserFieldNotesTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'count_user_field_notes',
    description:
      "Restituisce il numero totale di note di campo registrate dall'utente e il conteggio per stato (PENDING, PROCESSING, PROCESSED, FAILED, MANUALLY_REVIEWED). Usa quando l'utente chiede 'quante note ho', 'statistiche', 'riepilogo note', ecc. Nessun parametro richiesto.",
    schema: z.object({}),
    func: async () => {
      const startTime = Date.now();
      try {
        const stats = await countUserFieldNotes({ userId, prisma });
        console.log(
          `${LOG_PREFIX.TOOL_COUNT_FIELD_NOTES} Total=${stats.totalNotes} in ${Date.now() - startTime}ms`,
        );
        return JSON.stringify(stats, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_COUNT_FIELD_NOTES} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Conteggio note di campo fallito: ${errorMessage}`);
      }
    },
  });
};

/**
 * Tool: list_user_field_notes
 * Lists existing field notes (not used for disambiguation before save — for
 * that use find_user_fields/find_user_production_units/find_user_products).
 * Results are ordered by operationDate desc, capped at `limit` (default 10, max 50).
 */
export const createListUserFieldNotesTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'list_user_field_notes',
    description:
      "Elenca le note di campo già registrate dall'utente con filtri opzionali (categoria, stato, campo, unità produttiva, prodotto, intervallo date, presenza GPS). Ordinate per data operazione decrescente. Usa quando l'utente chiede 'mostrami le note', 'quali trattamenti ho fatto', 'note di aprile', 'note con foto', ecc. NON usare per disambiguare prima di save_field_note — per quello usa find_user_fields/find_user_production_units.",
    schema: z.object({
      category: z
        .nativeEnum(FieldNoteCategory)
        .optional()
        .describe('Filtra per categoria (OPERAZIONE, OSSERVAZIONE, ecc.)'),
      status: z
        .nativeEnum(FieldNoteProcessingStatus)
        .optional()
        .describe('Filtra per stato elaborazione'),
      fieldId: z.string().optional().describe('Filtra per ID campo'),
      productionUnitId: z.string().optional().describe('Filtra per ID unità produttiva'),
      productId: z.string().optional().describe('Filtra per ID prodotto'),
      startDate: z
        .string()
        .optional()
        .describe('Data inizio intervallo in formato ISO 8601 (inclusiva)'),
      endDate: z
        .string()
        .optional()
        .describe('Data fine intervallo in formato ISO 8601 (inclusiva)'),
      hasLocation: z
        .boolean()
        .optional()
        .describe('true = solo note con coordinate GPS, false = solo senza'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Numero massimo di risultati (default 10, max 50)'),
    }),
    func: async (input) => {
      const startTime = Date.now();
      try {
        const result = await listUserFieldNotes({
          userId,
          prisma,
          category: input.category,
          status: input.status,
          fieldId: input.fieldId,
          productionUnitId: input.productionUnitId,
          productId: input.productId,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          hasLocation: input.hasLocation,
          limit: input.limit,
        });
        console.log(
          `${LOG_PREFIX.TOOL_LIST_FIELD_NOTES} Matched=${result.totalMatched} returned=${result.returned} in ${Date.now() - startTime}ms`,
        );
        return JSON.stringify(result, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_LIST_FIELD_NOTES} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Ricerca note di campo fallita: ${errorMessage}`);
      }
    },
  });
};

/**
 * Tool: get_field_note_by_id
 * Returns the full detail of a specific field note. Refuses access if the
 * note does not belong to the caller.
 */
export const createGetUserFieldNoteByIdTool = (userId: string, prisma: PrismaClient) => {
  return new DynamicStructuredTool({
    name: 'get_field_note_by_id',
    description:
      "Recupera il dettaglio completo di una singola nota di campo dato il suo ID. Usa dopo list_user_field_notes quando l'utente chiede dettagli su una nota specifica. Restituisce null se l'ID non esiste o appartiene a un altro utente.",
    schema: z.object({
      fieldNoteId: z.string().describe('ID della nota di campo da recuperare'),
    }),
    func: async ({ fieldNoteId }) => {
      const startTime = Date.now();
      try {
        const detail = await getUserFieldNoteById({ userId, fieldNoteId, prisma });
        console.log(
          `${LOG_PREFIX.TOOL_GET_FIELD_NOTE} ${fieldNoteId} ${detail ? 'found' : 'not-found'} in ${Date.now() - startTime}ms`,
        );
        if (!detail) {
          return JSON.stringify({ found: false, fieldNoteId });
        }
        return JSON.stringify({ found: true, fieldNote: detail }, null, 2);
      } catch (error) {
        console.error(
          `${LOG_PREFIX.TOOL_GET_FIELD_NOTE} Error after ${Date.now() - startTime}ms:`,
          error,
        );
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Recupero nota di campo fallito: ${errorMessage}`);
      }
    },
  });
};
