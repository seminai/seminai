import type { BdfClient } from '../../integrations/bdf/client';
import type { CachedBdfClient } from '../../integrations/bdf/cachedClient';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BdfProductVectorStore } from './rag';
import { getFieldNoteAgentRegistry } from './FieldNoteAgentRegistry';
import { CACHE_THRESHOLD, LOG_PREFIX, buildSaMechanismMap, findBestDirectMatch, getProductMechanisms, resolveNameWithLlm } from './bdfToolWrappers.part-01-log-prefix';

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
