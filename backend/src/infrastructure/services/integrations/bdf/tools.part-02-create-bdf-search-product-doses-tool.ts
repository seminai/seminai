import type { BdfClient } from './client';
import type { CachedBdfClient } from './cachedClient';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { findBestDirectMatch, normalizeDosesPayload, resolveNameWithLlm } from './tools.part-01-find-best-direct-match';

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
