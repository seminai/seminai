import { PrismaClient, FieldNoteCategory, FieldNoteProcessingStatus } from '@prisma/client';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { countUserFieldNotes } from '../../tool/countUserFieldNotes';
import { LOG_PREFIX } from './messages';
import { listUserFieldNotes } from '../../tool/listUserFieldNotes';
import { getUserFieldNoteById } from '../../tool/getUserFieldNoteById';

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
