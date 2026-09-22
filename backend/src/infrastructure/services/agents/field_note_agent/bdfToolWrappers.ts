/**
 * BDF tool wrappers with in-memory vector store caching.
 *
 * Wraps the generic BDF tools to add automatic caching of large product result sets.
 * When a search returns >20 products, results are indexed in a BdfProductVectorStore
 * and a summary is returned to the LLM instead of the full list.
 * A companion search tool allows semantic follow-up queries on cached products.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { BdfClient } from '../../integrations/bdf/client';
import type { CachedBdfClient } from '../../integrations/bdf/cachedClient';
import type { BdfProdotto } from '../../integrations/bdf/types';
import { BdfProductVectorStore } from './rag';
import type { SaMechanismMap } from './rag';
import { getFieldNoteAgentRegistry } from './FieldNoteAgentRegistry';
import { createChatModel } from '../../llm-model-factory';

const LOG_PREFIX = '[BDF-Cache]';
const CACHE_THRESHOLD = 20;

/**
 * Finds the best matching crop/adversity by name using tiered matching.
 * (Same logic as in integrations/bdf/tools.ts)
 */
function findBestDirectMatch<T>(
  query: string,
  entries: T[],
  getName: (entry: T) => string,
): T | undefined {
  const queryLower = query.toLowerCase().trim();

  const exact = entries.find((e) => getName(e).toLowerCase() === queryLower);
  if (exact) return exact;

  const startsWith = entries.find((e) => getName(e).toLowerCase().startsWith(queryLower));
  if (startsWith) return startsWith;

  const wordBoundary = entries.find((e) => {
    const name = getName(e).toLowerCase();
    const regex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return regex.test(name);
  });
  if (wordBoundary) return wordBoundary;

  return entries.find((e) => getName(e).toLowerCase().includes(queryLower));
}

/**
 * Uses LLM to resolve user-provided name to best matching entry.
 * (Same logic as in integrations/bdf/tools.ts)
 */
async function resolveNameWithLlm(
  userInput: string,
  availableEntries: Array<{ code: string; name: string }>,
  context: string,
): Promise<string | null> {
  if (availableEntries.length === 0) return null;

  try {
    const { model } = createChatModel({
      modelName: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 30,
    });

    const entriesList = availableEntries.map((e) => `${e.code}: ${e.name}`).join('\n');

    const response = await model.invoke([
      {
        role: 'system',
        content:
          `Sei un esperto agronomo. Devi trovare la corrispondenza migliore tra il termine dell'utente e la lista disponibile di ${context}. ` +
          `Il termine potrebbe essere un nome comune, dialettale, abbreviato o scientifico. ` +
          `Rispondi SOLO con il codice della voce che corrisponde meglio. Se non trovi corrispondenza, rispondi NONE.`,
      },
      {
        role: 'user',
        content: `Termine cercato: "${userInput}"\n\nLista ${context} disponibili:\n${entriesList}\n\nCodice:`,
      },
    ]);

    const raw = response.content.toString().trim();
    const code = raw.replace(/[^0-9a-zA-Z_-]/g, '');
    if (!code || code.toUpperCase() === 'NONE') return null;

    const match = availableEntries.find((e) => e.code === code);
    return match ? code : null;
  } catch (error) {
    console.error(`${LOG_PREFIX} LLM name resolution failed for "${userInput}":`, error);
    return null;
  }
}

/**
 * Builds a map of SA name (lowercase) → mechanism of action from BDF API data.
 * Uses getSostanzeAttive to get SA codes, then getSostanzaAttivaDati for mechanism details.
 * All calls go through CachedBdfClient (7-day cache) so repeated calls are essentially free.
 */
async function buildSaMechanismMap(
  client: BdfClient | CachedBdfClient,
  cropId: number,
  products: BdfProdotto[],
): Promise<SaMechanismMap> {
  const map: SaMechanismMap = new Map();

  try {
    // Collect unique SA names from products
    const saNames = new Set<string>();
    for (const p of products) {
      if (p.SA1) saNames.add(p.SA1);
      if (p.SA2) saNames.add(p.SA2);
      if (p.SA3) saNames.add(p.SA3);
    }

    if (saNames.size === 0) return map;

    // Get all SAs for this crop (1 cached API call)
    const allSAs = await client.getSostanzeAttive({ coltura: cropId });

    // Build name → code lookup (case-insensitive)
    const saNameToCode = new Map<string, string>();
    for (const sa of allSAs) {
      saNameToCode.set(sa.DECODIFICA.toLowerCase(), sa.CODICE);
    }

    // Find codes for our product SAs
    const codesToFetch = new Set<string>();
    const nameToCode = new Map<string, string>();
    for (const name of saNames) {
      const code = saNameToCode.get(name.toLowerCase());
      if (code) {
        codesToFetch.add(code);
        nameToCode.set(name.toLowerCase(), code);
      }
    }

    if (codesToFetch.size === 0) return map;

    // Fetch mechanism data in parallel (each call cached individually for 7 days)
    const codeArray = Array.from(codesToFetch);
    const results = await Promise.allSettled(
      codeArray.map((code) => client.getSostanzaAttivaDati(code)),
    );

    // Build code → mechanism map
    const codeToMechanism = new Map<string, string>();
    for (let i = 0; i < codeArray.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.length > 0) {
        const mechanism = result.value[0].MECCANISMO_AZIONE;
        if (mechanism) {
          codeToMechanism.set(codeArray[i], mechanism);
        }
      }
    }

    // Build final SA name → mechanism map
    for (const name of saNames) {
      const code = nameToCode.get(name.toLowerCase());
      if (code) {
        const mechanism = codeToMechanism.get(code);
        if (mechanism) {
          map.set(name.toLowerCase(), mechanism);
        }
      }
    }

    console.log(
      `${LOG_PREFIX} Built SA mechanism map: ${map.size} mechanisms for ${saNames.size} active substances`,
    );
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to build SA mechanism map (non-blocking):`, error);
  }

  return map;
}

/**
 * Looks up mechanism of action for a product's active substances.
 */
function getProductMechanisms(product: BdfProdotto, saMechanismMap: SaMechanismMap): string[] {
  const mechanisms = new Set<string>();
  for (const sa of [product.SA1, product.SA2, product.SA3]) {
    if (sa) {
      const mechanism = saMechanismMap.get(sa.toLowerCase());
      if (mechanism) mechanisms.add(mechanism);
    }
  }
  return Array.from(mechanisms);
}

/**
 * Creates a wrapped bdf_search_products_by_adversity tool that caches large result sets
 * in an in-memory vector store for semantic follow-up queries.
 *
 * Uses the same tool name as the original so the LLM doesn't need to learn a new name.
 */
export const createBdfSearchProductsByAdversityWithCacheTool = (
  client: BdfClient | CachedBdfClient,
  threadId: string,
) => {
  return new DynamicStructuredTool({
    name: 'bdf_search_products_by_adversity',
    description:
      'Cerca i prodotti fitosanitari autorizzati per trattare una specifica avversità su una coltura nella Banca Dati Fitofarmaci (BDF). ' +
      'Usa questo tool quando conosci la coltura e la malattia/avversità e vuoi sapere quali prodotti sono autorizzati. ' +
      'Restituisce la lista dei prodotti autorizzati con le loro sostanze attive. ' +
      'Se i risultati sono molti (>20), vengono indicizzati automaticamente per ricerche semantiche successive con search_bdf_cached_products.',
    schema: z.object({
      cropName: z
        .string()
        .describe('Nome della coltura di interesse (es. "Vite", "Melo", "Pomodoro", "Olivo").'),
      adversityName: z
        .string()
        .describe(
          'Nome della malattia o avversità da trattare (es. "Peronospora", "Oidio", "Afidi", "Batteriosi").',
        ),
    }),
    func: async ({ cropName, adversityName }) => {
      try {
        // Step 1: Find crop by name
        const crops = await client.getColture();
        let crop = findBestDirectMatch(cropName, crops, (c) => c.NOME_COLTURA);

        if (!crop) {
          const resolvedCropCode = await resolveNameWithLlm(
            cropName,
            crops.map((c) => ({ code: String(c.ID_PV), name: c.NOME_COLTURA })),
            'colture agricole',
          );
          if (resolvedCropCode) {
            crop = crops.find((c) => String(c.ID_PV) === resolvedCropCode);
          }
        }

        if (!crop) {
          const cropNameLower = cropName.toLowerCase();
          const suggestions = crops
            .filter((c) =>
              cropNameLower
                .split(' ')
                .some((word) => word.length >= 3 && c.NOME_COLTURA.toLowerCase().includes(word)),
            )
            .slice(0, 10);

          return JSON.stringify({
            error: `Coltura "${cropName}" non trovata nella banca dati`,
            suggestions:
              suggestions.length > 0
                ? suggestions.map((c) => ({ id: c.ID_PV, nome: c.NOME_COLTURA }))
                : undefined,
            hint: 'Prova con un nome diverso o più generico.',
          });
        }

        // Step 2: Find adversity by name
        const adversities = await client.getAvversita(crop.ID_PV);
        let adversity = findBestDirectMatch(adversityName, adversities, (a) => a.NOME_ITA);

        if (!adversity) {
          const resolvedAdvCode = await resolveNameWithLlm(
            adversityName,
            adversities.map((a) => ({ code: a.COD_AVVERSITA, name: a.NOME_ITA })),
            'avversità/malattie della coltura',
          );
          if (resolvedAdvCode) {
            adversity = adversities.find((a) => a.COD_AVVERSITA === resolvedAdvCode);
          }
        }

        if (!adversity) {
          return JSON.stringify({
            error: `Avversità "${adversityName}" non trovata per la coltura "${crop.NOME_COLTURA}"`,
            suggestion: `Non è stato possibile risolvere "${adversityName}" automaticamente. Chiedi all'utente quale avversità intende, proponendo queste opzioni:`,
            crop: {
              id: crop.ID_PV,
              nome: crop.NOME_COLTURA,
            },
            availableAdversities: adversities.slice(0, 15).map((a) => ({
              codice: a.COD_AVVERSITA,
              nome: a.NOME_ITA,
            })),
          });
        }

        // Step 3: Get authorized products
        const products = await client.getProdotti({
          coltura: crop.ID_PV,
          avversita: adversity.COD_AVVERSITA,
        });

        const cropInfo = { id: crop.ID_PV, nome: crop.NOME_COLTURA };
        const adversityInfo = { codice: adversity.COD_AVVERSITA, nome: adversity.NOME_ITA };

        // Step 4: Enrich with mechanism of action data
        const saMechanismMap = await buildSaMechanismMap(client, crop.ID_PV, products);

        const mapProduct = (p: (typeof products)[0]) => ({
          codice: p.COD_PRODOTTO,
          nome: p.NOME_COMMERCIALE,
          bio: p.BIO,
          inVendita: p.IN_VENDITA,
          sostanzeAttive: [p.SA1, p.SA2, p.SA3].filter(Boolean),
          meccanismoAzione: getProductMechanisms(p, saMechanismMap),
          revocato: p.REVOCATO,
          scorte: p.SCORTE,
          numRegistrazione: p.NUM_REG,
        });

        // If few products, return full list
        if (products.length <= CACHE_THRESHOLD) {
          return JSON.stringify({
            crop: cropInfo,
            adversity: adversityInfo,
            totalProducts: products.length,
            products: products.map(mapProduct),
          });
        }

        // Many products: index in vector store and return summary
        console.log(
          `${LOG_PREFIX} ${products.length} products found, indexing in vector store for thread ${threadId}`,
        );

        const store = new BdfProductVectorStore();
        await store.indexProducts(products, crop.NOME_COLTURA, adversity.NOME_ITA, saMechanismMap);

        // Store in registry
        const registry = getFieldNoteAgentRegistry();
        registry.setBdfProductVectorStore(threadId, store);

        // Build summary grouped by mechanism of action
        const availableProducts = products.filter((p) => p.IN_VENDITA && !p.REVOCATO);

        const contactProducts = availableProducts
          .filter((p) => {
            const mechs = getProductMechanisms(p, saMechanismMap);
            return mechs.some((m) => /contatto/i.test(m));
          })
          .slice(0, 5);

        const systemicProducts = availableProducts
          .filter((p) => {
            const mechs = getProductMechanisms(p, saMechanismMap);
            return mechs.some((m) => /sistemic/i.test(m));
          })
          .slice(0, 5);

        const bioProducts = availableProducts.filter((p) => p.BIO).slice(0, 5);

        // Collect unique active substances and mechanisms
        const activeSubstances = new Set<string>();
        const allMechanisms = new Set<string>();
        for (const p of products) {
          if (p.SA1) activeSubstances.add(p.SA1);
          if (p.SA2) activeSubstances.add(p.SA2);
          if (p.SA3) activeSubstances.add(p.SA3);
          for (const m of getProductMechanisms(p, saMechanismMap)) {
            allMechanisms.add(m);
          }
        }

        return JSON.stringify({
          crop: cropInfo,
          adversity: adversityInfo,
          totalProducts: products.length,
          cachedInVectorStore: true,
          summary: `Trovati ${products.length} prodotti autorizzati. Indicizzati in cache semantica per ricerche di follow-up.`,
          topContactProducts: contactProducts.map(mapProduct),
          topSystemicProducts: systemicProducts.map(mapProduct),
          topBioProducts: bioProducts.map(mapProduct),
          activeSubstanceGroups: Array.from(activeSubstances).sort(),
          availableMechanisms: Array.from(allMechanisms).sort(),
          stats: {
            totalBio: products.filter((p) => p.BIO).length,
            totalContact:
              contactProducts.length > 0
                ? availableProducts.filter((p) =>
                    getProductMechanisms(p, saMechanismMap).some((m) => /contatto/i.test(m)),
                  ).length
                : 0,
            totalSystemic:
              systemicProducts.length > 0
                ? availableProducts.filter((p) =>
                    getProductMechanisms(p, saMechanismMap).some((m) => /sistemic/i.test(m)),
                  ).length
                : 0,
            totalInVendita: availableProducts.length,
            totalRevocati: products.filter((p) => p.REVOCATO).length,
          },
          hint: 'Per cercare tra tutti i prodotti, usa search_bdf_cached_products con una query specifica (es. "prodotti coprenti contatto", "sistemici convenzionali").',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error(`${LOG_PREFIX} bdf_search_products_by_adversity failed:`, error);
        return JSON.stringify({
          error: `Errore nella ricerca BDF: ${errorMessage}`,
          fallbackHint:
            'La Banca Dati Fitofarmaci non è al momento disponibile. Usa search_disciplinari_database o tavily_search per cercare i prodotti autorizzati.',
          searchParams: { cropName, adversityName },
        });
      }
    },
  });
};

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
