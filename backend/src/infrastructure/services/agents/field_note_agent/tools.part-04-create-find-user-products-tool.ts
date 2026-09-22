import { PrismaClient, ProductCategory } from '@prisma/client';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { findUserProducts } from '../../tool/findUserProducts';
import { saveFieldNote, SaveFieldNoteSchema } from '../../tool/saveFieldNote';
import { saveStockInPurchase, SaveStockInPurchaseSchema } from '../../tool/saveStockInPurchase';
import { resolveCompanyId } from './tools.part-01-create-find-user-companies-tool';

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
