import type { BdfClient } from './client';
import type { CachedBdfClient } from './cachedClient';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { findBestDirectMatch, resolveNameWithLlm } from './tools.part-01-find-best-direct-match';

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
