import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getFieldNoteAgentRegistry } from './FieldNoteAgentRegistry';
import { LOG_PREFIX } from './bdfToolWrappers.part-01-log-prefix';

/**
 * Creates a tool that performs semantic search over cached BDF products.
 * Works only after bdf_search_products_by_adversity has cached results.
 */
export const createSearchBdfCachedProductsTool = (threadId: string) => {
  return new DynamicStructuredTool({
    name: 'search_bdf_cached_products',
    description:
      'Cerca semanticamente tra i prodotti BDF precedentemente trovati e salvati in cache. ' +
      'Usa questo tool per rispondere a domande di follow-up sui prodotti autorizzati, ' +
      'come filtrare per biologici, cercare per sostanza attiva, o trovare prodotti specifici. ' +
      'Funziona SOLO dopo che bdf_search_products_by_adversity ha trovato molti prodotti (>20).',
    schema: z.object({
      query: z
        .string()
        .describe(
          'La domanda o criterio di ricerca in linguaggio naturale ' +
            '(es. "prodotti biologici con rame", "fungicidi a base di zolfo", "prodotti non revocati")',
        ),
      topK: z
        .number()
        .optional()
        .describe('Numero massimo di risultati da restituire (default: 10)'),
    }),
    func: async ({ query, topK }) => {
      const registry = getFieldNoteAgentRegistry();
      const store = registry.getBdfProductVectorStore(threadId);

      if (!store || !store.hasDocuments()) {
        return JSON.stringify({
          error:
            'Nessun prodotto in cache. Esegui prima una ricerca con bdf_search_products_by_adversity.',
          hint: 'Cerca prima i prodotti autorizzati per una coltura e avversità specifica.',
        });
      }

      try {
        const results = await store.search(query, topK ?? 10);
        const stats = store.getStats();

        return JSON.stringify({
          query,
          totalCachedProducts: stats?.totalProducts ?? 0,
          resultsFound: results.length,
          products: results.map((r) => ({
            ...r.document.metadata,
            relevanceScore: Math.round(r.score * 100) / 100,
          })),
          searchContext: stats
            ? {
                cropName: stats.cropName,
                adversityName: stats.adversityName,
                indexedAt: stats.indexedAt.toISOString(),
              }
            : null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error(`${LOG_PREFIX} search_bdf_cached_products failed:`, errorMessage);
        return JSON.stringify({
          error: `Errore nella ricerca in cache: ${errorMessage}`,
        });
      }
    },
  });
};
