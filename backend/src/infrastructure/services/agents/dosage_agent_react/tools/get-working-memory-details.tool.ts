import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory } from '../working-memory';

/** Keys the agent is allowed to query via this tool */
const QUERYABLE_KEYS = [
  'inputProducts',
  'inputUnits',
  'userFields',
  'matchedProducts',
  'dosageResults',
  'labelCache',
] as const;

type QueryableKey = (typeof QUERYABLE_KEYS)[number];

/**
 * Tool: get_working_memory_details
 * Retrieves specific items from working memory with optional filtering.
 * Used after discovery tools return compact indexes.
 */
export function createGetWorkingMemoryDetailsTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_working_memory_details',
    description: `Recupera dettagli specifici dalla working memory.
Usa questo tool quando un tool precedente ha restituito un indice compatto
e hai bisogno dei dati completi di elementi specifici.

Chiavi disponibili:
- inputProducts: prodotti a magazzino (da list_company_products)
- inputUnits: unità di produzione (da list_production_units)
- userFields: campi/parcelle (da list_user_fields)
- matchedProducts: prodotti abbinati a colture (da search_products)
- dosageResults: risultati calcolo dosi (da calculate_dosage)
- labelCache: etichette ministeriali cached (da search_product_label_database)

Filtri opzionali:
- indices: array di indici (dalla lista indexata, 0-based). Es. [0, 2, 5]
- nameFilter: filtra per nome (ricerca parziale, case-insensitive)
- limit: max risultati (default 10)`,
    schema: z.object({
      key: z.enum(QUERYABLE_KEYS).describe('Chiave della working memory da interrogare'),
      indices: z
        .array(z.number())
        .optional()
        .describe('Indici specifici da recuperare (0-based, dalla lista indexata)'),
      nameFilter: z
        .string()
        .optional()
        .describe('Filtra per nome (ricerca parziale, case-insensitive)'),
      limit: z.number().optional().default(10).describe('Massimo numero di risultati (default 10)'),
    }),
    func: async ({ key, indices, nameFilter, limit }) => {
      const wm = getWorkingMemory(threadId);
      const data = wm[key as QueryableKey];

      if (data === undefined || data === null) {
        return JSON.stringify({
          error: `Nessun dato in working memory per "${key}".`,
          hint: 'Esegui prima il tool che popola questa chiave.',
        });
      }

      // Handle Record types (labelCache)
      if (key === 'labelCache' && typeof data === 'object' && !Array.isArray(data)) {
        const record = data as Record<string, unknown>;
        const entries = Object.entries(record);
        if (nameFilter) {
          const filter = nameFilter.toLowerCase();
          const filtered = entries.filter(([k]) => k.toLowerCase().includes(filter));
          return JSON.stringify({
            key,
            totalEntries: entries.length,
            returnedEntries: filtered.length,
            data: Object.fromEntries(filtered.slice(0, limit)),
          });
        }
        return JSON.stringify({
          key,
          totalEntries: entries.length,
          returnedEntries: Math.min(entries.length, limit),
          data: Object.fromEntries(entries.slice(0, limit)),
        });
      }

      // Handle array types
      if (!Array.isArray(data)) {
        return JSON.stringify({ key, data });
      }

      let result = [...data];

      // Apply index filter
      if (indices && indices.length > 0) {
        result = indices
          .filter((idx: number) => idx >= 0 && idx < data.length)
          .map((idx: number) => data[idx] as unknown);
      }

      // Apply name filter
      if (nameFilter) {
        const filter = nameFilter.toLowerCase();
        result = result.filter((item: unknown) => {
          const rec = item as Record<string, unknown>;
          const name = rec.name ?? rec.productName ?? '';
          return typeof name === 'string' && name.toLowerCase().includes(filter);
        });
      }

      // Apply limit
      const limited = result.slice(0, limit);

      return JSON.stringify({
        key,
        totalItems: data.length,
        returnedItems: limited.length,
        items: limited,
      });
    },
  });
}
