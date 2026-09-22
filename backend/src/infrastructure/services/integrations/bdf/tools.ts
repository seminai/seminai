/**
 * BDF WS LLM Tools for chat agents
 *
 * Tool A: bdf_search_product_doses — Flow 1: product name → doses
 * Tool B: bdf_search_products_by_adversity — Flow 2: crop + adversity → authorized products
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { BdfClient } from './client';
import type { CachedBdfClient } from './cachedClient';
import { createChatModel } from '../../llm-model-factory';

/**
 * Finds the best matching crop/adversity by name using tiered matching:
 * 1. Exact match (case-insensitive)
 * 2. Starts-with match (e.g. "Vite" → "Vite da uva da vino")
 * 3. Contains match (e.g. "oidio" → "Oidio o Mal bianco della vite")
 */
export function findBestDirectMatch<T>(
  query: string,
  entries: T[],
  getName: (entry: T) => string,
): T | undefined {
  const queryLower = query.toLowerCase().trim();

  // 1. Exact match
  const exact = entries.find((e) => getName(e).toLowerCase() === queryLower);
  if (exact) return exact;

  // 2. Starts-with match (prefer "Vite da uva da vino" over "Foglie di vite" when searching "Vite")
  const startsWith = entries.find((e) => getName(e).toLowerCase().startsWith(queryLower));
  if (startsWith) return startsWith;

  // 3. Word-boundary match (the query appears as a whole word)
  const wordBoundary = entries.find((e) => {
    const name = getName(e).toLowerCase();
    const regex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return regex.test(name);
  });
  if (wordBoundary) return wordBoundary;

  // 4. Contains match (fallback)
  return entries.find((e) => getName(e).toLowerCase().includes(queryLower));
}

/**
 * Uses LLM (gpt-4o-mini) to resolve a user-provided name to the best matching entry
 * from a list of available items. Handles common name → technical/scientific name resolution.
 * e.g. "oidio" → "Oidio della vite (Erysiphe necator)"
 */
export async function resolveNameWithLlm(
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

    // Verify the code exists in the list
    const match = availableEntries.find((e) => e.code === code);
    return match ? code : null;
  } catch (error) {
    console.error(`[BDF] LLM name resolution failed for "${userInput}":`, error);
    return null;
  }
}

function normalizeDosesPayload(rawDoses: unknown): unknown[] {
  if (Array.isArray(rawDoses)) return rawDoses;
  if (rawDoses && typeof rawDoses === 'object') return [rawDoses];
  return [];
}

/**
 * Flow 1: Starting from product name, find doses for a specific crop and adversity.
 *
 * Steps:
 * 1. Search product by name → get COD_PRODOTTO
 * 2. Get all crops → find crop by name → get ID_PV
 * 3. Get adversities for crop → find adversity by name → get COD_AVVERSITA
 * 4. Get doses for product/crop/adversity
 */
export const createBdfSearchProductDosesTool = (client: BdfClient | CachedBdfClient) => {
  return new DynamicStructuredTool({
    name: 'bdf_search_product_doses',
    description:
      'Cerca le dosi di un prodotto fitosanitario per una specifica coltura e avversità nella Banca Dati Fitofarmaci (BDF). ' +
      'Usa questo tool quando conosci il nome del prodotto commerciale e vuoi trovare le dosi autorizzate. ' +
      'Restituisce informazioni dettagliate su dosaggi, numero massimo di interventi, intervallo di sicurezza e altre indicazioni di etichetta.',
    schema: z.object({
      productName: z
        .string()
        .describe(
          'Nome commerciale del prodotto fitosanitario da cercare (es. "Epik SL", "Chorus"). Minimo 3 caratteri.',
        ),
      cropName: z
        .string()
        .describe(
          'Nome della coltura su cui si vuole utilizzare il prodotto (es. "Vite", "Melo", "Pomodoro").',
        ),
      adversityName: z
        .string()
        .describe(
          'Nome della malattia o avversità da trattare (es. "Peronospora", "Oidio", "Afidi").',
        ),
    }),
    func: async ({ productName, cropName, adversityName }) => {
      try {
        // Step 1: Search product by name
        const products = await client.getProdotti({ ricalfa: productName });

        if (products.length === 0) {
          return JSON.stringify({
            error: `Nessun prodotto trovato con nome "${productName}"`,
            suggestion: 'Verifica il nome del prodotto e riprova con almeno 3 caratteri.',
          });
        }

        // Pick the best match (exact match first, then first result)
        const productNameLower = productName.toLowerCase();
        const exactMatch = products.find(
          (p) => p.NOME_COMMERCIALE.toLowerCase() === productNameLower,
        );
        const product = exactMatch ?? products[0];

        // Step 2: Find crop by name (tiered direct match, then LLM fallback)
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
          return JSON.stringify({
            error: `Coltura "${cropName}" non trovata nella banca dati`,
            availableProducts: products.slice(0, 5).map((p) => ({
              codice: p.COD_PRODOTTO,
              nome: p.NOME_COMMERCIALE,
            })),
            suggestion: 'Verifica il nome della coltura.',
          });
        }

        // Step 3: Find adversity by name (tiered direct match, then LLM fallback)
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
            availableAdversities: adversities.slice(0, 15).map((a) => ({
              codice: a.COD_AVVERSITA,
              nome: a.NOME_ITA,
            })),
            product: {
              codice: product.COD_PRODOTTO,
              nome: product.NOME_COMMERCIALE,
            },
            crop: {
              id: crop.ID_PV,
              nome: crop.NOME_COLTURA,
            },
          });
        }

        // Step 4: Get doses
        const doses = await client.getDosi({
          codprod: product.COD_PRODOTTO,
          coltura: crop.ID_PV,
          avversita: adversity.COD_AVVERSITA,
        });
        const normalizedDoses = normalizeDosesPayload(doses);

        return JSON.stringify({
          product: {
            codice: product.COD_PRODOTTO,
            nome: product.NOME_COMMERCIALE,
            bio: product.BIO,
            sostanzeAttive: [product.SA1, product.SA2, product.SA3].filter(Boolean),
            revocato: product.REVOCATO,
          },
          crop: {
            id: crop.ID_PV,
            nome: crop.NOME_COLTURA,
          },
          adversity: {
            codice: adversity.COD_AVVERSITA,
            nome: adversity.NOME_ITA,
          },
          doses: normalizedDoses.map((dose) => {
            const d = dose as Record<string, unknown>;
            return {
              idDose: d.ID_DOSE,
              doseMin: d.DOSE_MIN,
              doseMax: d.DOSE_MAX,
              unitaDose: d.DECO_UM_DOSE,
              doseMin2: d.DOSE_MIN_2,
              doseMax2: d.DOSE_MAX_2,
              unitaDose2: d.DECO_UM_DOSE_2,
              numMaxInterventi: d.NUM_MAX_INT,
              intervalloTrattamento: d.INTERV_TRATT,
              riferimentoMaxTrattamenti: d.RIF_MAX_TRATT,
              carenza: d.CARENZA,
              epocaIntervento: d.EPOCA_INTERVENTO,
              acquaHaMin: d.ACQUA_HA_MIN,
              acquaHaMax: d.ACQUA_HA_MAX,
              sito: d.DECO_SITO,
              metodoDistribuzione: d.DECO_METODO_DIST,
              note: d.NOTE,
              scadenzaDosi: d.SCADENZA_DOSI,
            };
          }),
          allMatchingProducts:
            products.length > 1
              ? products.slice(0, 10).map((p) => ({
                  codice: p.COD_PRODOTTO,
                  nome: p.NOME_COMMERCIALE,
                }))
              : undefined,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error('[BDF] bdf_search_product_doses failed:', errorMessage);
        return JSON.stringify({
          error: `Errore nella ricerca BDF: ${errorMessage}`,
          fallbackHint:
            'La Banca Dati Fitofarmaci non è al momento disponibile. Usa search_disciplinari_database o tavily_search per cercare le informazioni sulle dosi del prodotto.',
          searchParams: { productName, cropName, adversityName },
        });
      }
    },
  });
};

/**
 * Flow 2: Starting from crop and adversity, find authorized products.
 *
 * Steps:
 * 1. Get all crops → find crop by name → get ID_PV
 * 2. Get adversities for crop → find adversity by name → get COD_AVVERSITA
 * 3. Get authorized products for crop/adversity
 */
export interface BdfProductCandidate {
  readonly codice: string;
  readonly nome: string;
  readonly bio: boolean;
  readonly inVendita: boolean;
  readonly sostanzeAttive: string[];
  readonly revocato: boolean;
  readonly scorte: boolean | null;
  readonly numRegistrazione: string;
}

export interface BdfAdversityProductsResult {
  crop?: { id: number; nome: string };
  adversity?: { codice: string; nome: string };
  totalProducts?: number;
  products?: BdfProductCandidate[];
  error?: string;
  suggestion?: string;
  suggestions?: Array<{ id: number; nome: string }>;
  availableAdversities?: Array<{ codice: string; nome: string }>;
  hint?: string;
  fallbackHint?: string;
  searchParams?: { cropName: string; adversityName: string };
}

/**
 * Core of Flow 2 (crop + adversity → authorized products), exposed as a plain
 * function so other tools (e.g. `recommend_best_products`) can reuse it without
 * going through the LLM tool wrapper. The `bdf_search_products_by_adversity`
 * tool below is a thin JSON wrapper over this.
 */
export async function searchBdfProductsByAdversity(
  client: BdfClient | CachedBdfClient,
  cropName: string,
  adversityName: string,
): Promise<BdfAdversityProductsResult> {
  try {
    // Step 1: Find crop by name (tiered direct match, then LLM fallback)
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

      return {
        error: `Coltura "${cropName}" non trovata nella banca dati`,
        suggestions:
          suggestions.length > 0
            ? suggestions.map((c) => ({ id: c.ID_PV, nome: c.NOME_COLTURA }))
            : undefined,
        hint: 'Prova con un nome diverso o più generico.',
      };
    }

    // Step 2: Find adversity by name (tiered direct match, then LLM fallback)
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
      return {
        error: `Avversità "${adversityName}" non trovata per la coltura "${crop.NOME_COLTURA}"`,
        suggestion: `Non è stato possibile risolvere "${adversityName}" automaticamente. Chiedi all'utente quale avversità intende, proponendo queste opzioni:`,
        crop: { id: crop.ID_PV, nome: crop.NOME_COLTURA },
        availableAdversities: adversities.slice(0, 15).map((a) => ({
          codice: a.COD_AVVERSITA,
          nome: a.NOME_ITA,
        })),
      };
    }

    // Step 3: Get authorized products
    const products = await client.getProdotti({
      coltura: crop.ID_PV,
      avversita: adversity.COD_AVVERSITA,
    });

    return {
      crop: { id: crop.ID_PV, nome: crop.NOME_COLTURA },
      adversity: { codice: adversity.COD_AVVERSITA, nome: adversity.NOME_ITA },
      totalProducts: products.length,
      products: products.map((p) => ({
        codice: p.COD_PRODOTTO,
        nome: p.NOME_COMMERCIALE,
        bio: p.BIO,
        inVendita: p.IN_VENDITA,
        sostanzeAttive: [p.SA1, p.SA2, p.SA3].filter((sa): sa is string => Boolean(sa)),
        revocato: p.REVOCATO,
        scorte: p.SCORTE,
        numRegistrazione: p.NUM_REG,
      })),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
    console.error('[BDF] bdf_search_products_by_adversity failed:', errorMessage);
    return {
      error: `Errore nella ricerca BDF: ${errorMessage}`,
      fallbackHint:
        'La Banca Dati Fitofarmaci non è al momento disponibile. Usa search_disciplinari_database o tavily_search per cercare i prodotti autorizzati.',
      searchParams: { cropName, adversityName },
    };
  }
}

export const createBdfSearchProductsByAdversityTool = (client: BdfClient | CachedBdfClient) => {
  return new DynamicStructuredTool({
    name: 'bdf_search_products_by_adversity',
    description:
      'Cerca i prodotti fitosanitari autorizzati per trattare una specifica avversità su una coltura nella Banca Dati Fitofarmaci (BDF). ' +
      'Usa questo tool quando conosci la coltura e la malattia/avversità e vuoi sapere quali prodotti sono autorizzati. ' +
      'Restituisce la lista dei prodotti autorizzati con le loro sostanze attive.',
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
    func: async ({ cropName, adversityName }) =>
      JSON.stringify(await searchBdfProductsByAdversity(client, cropName, adversityName)),
  });
};
