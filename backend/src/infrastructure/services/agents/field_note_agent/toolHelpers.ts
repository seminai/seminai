/**
 * Helper utilities for field note agent tools.
 */
import { PrismaClient } from '@prisma/client';
import type { SaveFieldNoteInput } from '../../tool/saveFieldNote';

/**
 * Default maximum number of results to return from search tools.
 */
export const DEFAULT_MAX_RESULTS = 15;

/**
 * Result of a search operation with fallback support.
 */
export interface SearchResult<T> {
  matchFound: boolean;
  searchedFor?: string;
  message?: string;
  count: number;
  results: T[];
}

/**
 * Performs a search with automatic fallback to alternatives when no exact matches are found.
 *
 * @param primarySearch - Function to perform the primary search
 * @param fallbackSearch - Function to get all alternatives (called when primary returns empty)
 * @param searchTerm - The term being searched for
 * @param maxResults - Maximum number of results to return
 * @param noMatchMessage - Message template for when no match is found (use {term} placeholder)
 * @returns Search result with matchFound flag and results or alternatives
 */
export async function searchWithFallback<T>(
  primarySearch: () => Promise<T[]>,
  fallbackSearch: () => Promise<T[]>,
  searchTerm: string | undefined,
  maxResults: number = DEFAULT_MAX_RESULTS,
  noMatchMessage?: string,
): Promise<SearchResult<T>> {
  const results = await primarySearch();

  if (results.length > 0) {
    return {
      matchFound: true,
      count: results.length,
      results: results.slice(0, maxResults),
    };
  }

  // No matches found, try fallback if we have a search term
  if (searchTerm) {
    const alternatives = await fallbackSearch();

    if (alternatives.length > 0) {
      return {
        matchFound: false,
        searchedFor: searchTerm,
        message:
          noMatchMessage?.replace('{term}', searchTerm) ||
          `Nessun risultato trovato per "${searchTerm}", ecco le alternative disponibili:`,
        count: alternatives.length,
        results: alternatives.slice(0, maxResults),
      };
    }
  }

  // No results at all
  return {
    matchFound: false,
    searchedFor: searchTerm,
    count: 0,
    results: [],
  };
}

/**
 * Formats a search result as JSON string for tool response.
 *
 * @param result - The search result to format
 * @param entityName - Name of the entity type (e.g., "fields", "productionUnits")
 * @param emptyMessage - Message when no results found
 * @returns JSON string representation
 */
export function formatSearchResult<T>(
  result: SearchResult<T>,
  entityName: string,
  emptyMessage: string,
): string {
  if (result.count === 0) {
    return emptyMessage;
  }

  return JSON.stringify(
    {
      matchFound: result.matchFound,
      ...(result.searchedFor && { searchedFor: result.searchedFor }),
      ...(result.message && { message: result.message }),
      count: result.count,
      [entityName]: result.results,
    },
    null,
    2,
  );
}

/**
 * Executes multiple save_field_note tool calls in a single transaction.
 * This is more efficient than calling saveFieldNote N times sequentially.
 *
 * @param prisma PrismaClient instance
 * @param userId The user ID performing the operations
 * @param toolCalls Array of tool calls with save_field_note arguments
 * @returns Array of created field note IDs
 */
export async function executeBulkSaveFieldNotes(
  prisma: PrismaClient,
  userId: string,
  toolCalls: Array<{ args: Record<string, unknown>; id: string }>,
): Promise<{ fieldNoteIds: string[] }> {
  const { LOG_PREFIX } = await import('./messages');
  const { saveFieldNote } = await import('../../tool/saveFieldNote');
  const { SaveFieldNoteSchema } = await import('../../tool/saveFieldNote');
  const { assertFieldsAccess, assertProductionUnitsAccess } = await import(
    '../shared/authorization'
  );

  console.log(
    `${LOG_PREFIX.TOOL_BULK_SAVE} Starting bulk save for ${toolCalls.length} field notes`,
  );

  // Parse all inputs UPFRONT so we can fail-fast on authorization before
  // opening the prisma transaction. Asserting inside the tx would risk
  // deadlocks on large bulks (each save would issue N queries within the tx).
  const parsedInputs: SaveFieldNoteInput[] = toolCalls.map(
    (toolCall) => SaveFieldNoteSchema.parse(toolCall.args) as SaveFieldNoteInput,
  );

  const fieldIds = parsedInputs.map((input) => input.fieldId).filter((id): id is string => !!id);
  const productionUnitIds = parsedInputs
    .map((input) => input.productionUnitId)
    .filter((id): id is string => !!id);

  if (fieldIds.length > 0) {
    await assertFieldsAccess(userId, fieldIds);
  }
  if (productionUnitIds.length > 0) {
    await assertProductionUnitsAccess(userId, productionUnitIds);
  }

  const fieldNoteIds: string[] = [];

  // Execute all saves in a single transaction for atomicity
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < parsedInputs.length; i += 1) {
      const input = parsedInputs[i];

      console.log(
        `${LOG_PREFIX.TOOL_BULK_SAVE} Saving field note for fieldId: ${input.fieldId || 'unknown'}`,
      );

      const result = await saveFieldNote(userId, tx, input);

      if (result.success && result.fieldNoteId) {
        fieldNoteIds.push(result.fieldNoteId);
        console.log(`${LOG_PREFIX.TOOL_BULK_SAVE} Created field note: ${result.fieldNoteId}`);
      } else {
        console.error(`${LOG_PREFIX.TOOL_BULK_SAVE} Failed to save field note:`, result.message);
        throw new Error(`Failed to save field note: ${result.message}`);
      }
    }
  });

  console.log(
    `${LOG_PREFIX.TOOL_BULK_SAVE} Bulk save completed successfully. Created ${fieldNoteIds.length} field notes`,
  );

  return { fieldNoteIds };
}
