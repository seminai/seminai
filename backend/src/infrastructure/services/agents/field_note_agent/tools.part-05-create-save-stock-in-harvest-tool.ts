import { PrismaClient } from '@prisma/client';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { saveStockInHarvest, SaveStockInHarvestSchema } from '../../tool/saveStockInHarvest';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { saveStockOutSale, SaveStockOutSaleSchema } from '../../tool/saveStockOutSale';
import { saveStockOutTreatment, SaveStockOutTreatmentSchema } from '../../tool/saveStockOutTreatment';
import { z } from 'zod';
import { extractGpsFromImage } from '../../tool/extractGpsFromImage';

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
