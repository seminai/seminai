import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { createCachedBdfClient, searchBdfProductsByAdversity } from '../../../integrations/bdf';
import { resolveProductData, type ProductDataResolution } from '../../shared/resolveProductData';
import {
  checkProductRevoked,
  buildRevokedExclusionMessage,
} from '../../dosage_agent/revokedProductChecker';
import { updateWorkingMemory } from '../working-memory';
import {
  loadVerifiedStockByRegistration,
  normalizeRegistrationNumber,
} from './stock/verified-stock.helper';
import {
  DEFAULT_WEIGHTS,
  estimateEfficacy,
  rankCandidates,
  type CandidateInput,
  type RankingWeights,
} from './recommend-ranking';
import { getAnalyticsService } from '../../../analytics/analytics-service.singleton';

async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function formatDoseRange(resolution?: ProductDataResolution): string | null {
  if (!resolution) return null;
  const d = resolution.doses.find((x) => x.dose_minima != null || x.dose_massima != null);
  if (!d) return null;
  const um = d.dose_um ?? '';
  if (d.dose_minima != null && d.dose_massima != null && d.dose_minima !== d.dose_massima) {
    return `${d.dose_minima}-${d.dose_massima} ${um}`.trim();
  }
  const v = d.dose_massima ?? d.dose_minima;
  return v != null ? `${v} ${um}`.trim() : null;
}

/**
 * Tool: recommend_best_products
 * Ranks the BDF-authorized products for a crop + adversity by efficacy (LLM
 * estimate), FRAC/resistance rotation, bio/low-residue, and warehouse stock.
 * Resolves each product's data via the BDF → label DB → (scraping skipped here)
 * waterfall and always surfaces the source. Read-only; seeds working memory.
 */
export function createRecommendBestProductsTool(
  threadId: string,
  userId?: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'recommend_best_products',
    description:
      'Raccomanda i MIGLIORI prodotti fitosanitari e principi attivi per curare una specifica avversità su una coltura. ' +
      'Usa quando l\'utente chiede "qual è il prodotto migliore per <avversità> su <coltura>" o dopo diagnose_from_photo. ' +
      'Classifica i prodotti autorizzati BDF per efficacia (stima), rotazione FRAC, bio/carenza e disponibilità a magazzino. ' +
      'Dichiara sempre la fonte dei dati per ogni prodotto. Salva il risultato in working memory (recommendedProducts) e ' +
      'pre-popola inputProducts per i tool successivi (search_products → calculate_dosage).',
    schema: z.object({
      cropName: z.string().describe('Coltura target (es. "Vite", "Melo", "Pomodoro").'),
      adversityName: z
        .string()
        .describe('Malattia/avversità/insetto da curare (es. "Peronospora", "Oidio", "Afidi").'),
      preferBio: z.boolean().optional().default(false).describe('Privilegia prodotti biologici.'),
      preferLowResidue: z
        .boolean()
        .optional()
        .default(false)
        .describe('Privilegia carenza breve / basso impatto.'),
      onlyInStock: z
        .boolean()
        .optional()
        .default(false)
        .describe('Considera solo prodotti già disponibili a magazzino.'),
      fracRotationAvoid: z
        .array(z.string())
        .optional()
        .describe("Codici FRAC / meccanismi d'azione da evitare (già usati di recente)."),
      maxCandidates: z.number().int().min(1).max(20).optional().default(8),
      rankingWeights: z
        .object({
          efficacy: z.number().optional(),
          fracRotation: z.number().optional(),
          bioLowResidue: z.number().optional(),
          stockAvailability: z.number().optional(),
        })
        .optional()
        .describe('Pesi opzionali per le dimensioni di ranking (somma normalizzata internamente).'),
    }),
    func: async ({
      cropName,
      adversityName,
      preferBio,
      preferLowResidue,
      onlyInStock,
      fracRotationAvoid,
      maxCandidates,
      rankingWeights,
    }) => {
      if (!process.env.URL_SERVER_BDF || !process.env.USERNAME_BDF || !process.env.PASSWORD_BDF) {
        return JSON.stringify({
          error: 'BDF non configurato: impossibile enumerare i prodotti autorizzati per avversità.',
          hint: "Chiedi all'utente i nomi dei prodotti candidati e usa search_product_label_database per i dati.",
        });
      }

      const client = createCachedBdfClient();
      const search = await searchBdfProductsByAdversity(client, cropName, adversityName);
      if (!search.products || search.products.length === 0) {
        return JSON.stringify({
          error:
            search.error ??
            `Nessun prodotto autorizzato trovato per "${adversityName}" su "${cropName}".`,
          suggestions: search.suggestions,
          availableAdversities: search.availableAdversities,
          hint: 'Verifica coltura/avversità. Il database etichette non elenca prodotti per avversità: solo BDF lo fa.',
          source: 'bdf',
        });
      }

      const weights: RankingWeights = {
        efficacy: rankingWeights?.efficacy ?? DEFAULT_WEIGHTS.efficacy,
        fracRotation: rankingWeights?.fracRotation ?? DEFAULT_WEIGHTS.fracRotation,
        bioLowResidue: rankingWeights?.bioLowResidue ?? DEFAULT_WEIGHTS.bioLowResidue,
        stockAvailability: rankingWeights?.stockAvailability ?? DEFAULT_WEIGHTS.stockAvailability,
      };

      // Exclude revoked products entirely (not just deprioritize). The
      // ministerial dataset is authoritative and closes the BDF 7-day cache
      // window where a freshly-revoked product could still be recommended.
      const excludedRevoked: Array<{ nome: string; numRegistrazione: string; reason: string }> = [];
      const activeCandidates = [...search.products]
        .sort((a, b) => Number(b.inVendita) - Number(a.inVendita))
        .filter((cand) => {
          // RegNumber-only ministerial check: the name fallback is too lossy for
          // generic commercial names and could wrongly exclude an active product.
          const ministerial = checkProductRevoked(cand.numRegistrazione);
          if (cand.revocato === true || ministerial.isRevoked) {
            excludedRevoked.push({
              nome: cand.nome,
              numRegistrazione: cand.numRegistrazione,
              reason: ministerial.info
                ? buildRevokedExclusionMessage(ministerial.info)
                : 'Revocato secondo BDF.',
            });
            return false;
          }
          return true;
        });
      if (activeCandidates.length === 0) {
        return JSON.stringify({
          error: `Tutti i ${excludedRevoked.length} prodotti trovati per "${adversityName}" su "${cropName}" risultano revocati.`,
          excludedRevoked,
          hint: 'Nessun prodotto autorizzato attivo. Verificare avversità/coltura o cercare alternative.',
          source: 'bdf',
        });
      }
      const picked = activeCandidates.slice(0, maxCandidates);

      const resolutions = await mapWithConcurrency(picked, 3, (cand) =>
        resolveProductData({
          productName: cand.nome,
          registrationNumber: cand.numRegistrazione,
          cropName,
          adversityName,
          allowScraping: false,
        }),
      );
      const resByReg = new Map(picked.map((p, i) => [p.numRegistrazione, resolutions[i]]));

      const evaluateStock = !!userId && (onlyInStock || weights.stockAvailability > 0);
      const stockMap = evaluateStock ? await loadVerifiedStockByRegistration(userId!) : null;

      const efficacyMap =
        weights.efficacy > 0
          ? await estimateEfficacy(
              picked.map((p, i) => {
                const ais = resolutions[i].activeIngredients.map((a) => a.name);
                return {
                  registrationNumber: p.numRegistrazione,
                  productName: p.nome,
                  activeIngredients: ais.length ? ais : p.sostanzeAttive,
                };
              }),
              cropName,
              adversityName,
            )
          : new Map<string, number>();

      const inputs: CandidateInput[] = picked.map((cand, i) => {
        const r = resolutions[i];
        const ais = r.activeIngredients.map((a) => a.name);
        const carenze = r.doses
          .map((d) => d.intervallo_sicurezza_giorni)
          .filter((x): x is number => x != null);
        const stockEntry =
          stockMap?.get(normalizeRegistrationNumber(cand.numRegistrazione)) ?? null;
        return {
          productName: r.productName || cand.nome,
          registrationNumber: cand.numRegistrazione,
          activeIngredients: ais.length ? ais : cand.sostanzeAttive,
          frac:
            r.meccanismo_azione_frac ?? r.activeIngredients.find((a) => a.fracMoa)?.fracMoa ?? null,
          bio: r.bio ?? cand.bio,
          carenzaGiorni: carenze.length ? Math.min(...carenze) : null,
          fasceRispettoAcqua: r.fasce_rispetto_acqua,
          inVendita: cand.inVendita,
          inStockQty: evaluateStock ? stockEntry?.netQuantity ?? 0 : null,
          efficacy: weights.efficacy > 0 ? efficacyMap.get(cand.numRegistrazione) ?? null : null,
          source: r.source,
        };
      });
      const filtered = onlyInStock ? inputs.filter((c) => (c.inStockQty ?? 0) > 0) : inputs;
      const ranked = rankCandidates(filtered, {
        weights,
        fracRotationAvoid: fracRotationAvoid ?? [],
        preferBio,
        preferLowResidue,
      });
      const recommendations = ranked.map((c, idx) => ({
        rank: idx + 1,
        productName: c.productName,
        registrationNumber: c.registrationNumber,
        activeIngredients: c.activeIngredients,
        frac: c.frac,
        bio: c.bio,
        carenzaGiorni: c.carenzaGiorni,
        doseRange: formatDoseRange(resByReg.get(c.registrationNumber)),
        inStockQty: c.inStockQty,
        score: c.score,
        scoreBreakdown: c.scoreBreakdown,
        source: c.source,
      }));
      const topN = recommendations.slice(0, Math.min(5, recommendations.length));
      updateWorkingMemory(threadId, {
        recommendedProducts: recommendations.map((r) => ({
          rank: r.rank,
          productName: r.productName,
          registrationNumber: r.registrationNumber,
          activeIngredients: r.activeIngredients,
          frac: r.frac,
          bio: r.bio,
          carenzaGiorni: r.carenzaGiorni,
          doseRange: r.doseRange,
          inStockQty: r.inStockQty,
          score: r.score,
          source: r.source,
        })),
        inputProducts: topN.map((r) => ({
          productName: r.productName,
          registrationNumber: r.registrationNumber,
          ...(r.inStockQty && r.inStockQty > 0 ? { quantity: r.inStockQty } : {}),
        })),
      });
      const missing: string[] = [];
      if (weights.efficacy > 0)
        missing.push('efficacia: stima agronomica LLM, non un dato di etichetta');
      const noFrac = ranked.filter((c) => !c.frac).length;
      if (noFrac > 0)
        missing.push(
          `FRAC mancante per ${noFrac} prodotti (BDF non espone il meccanismo d'azione a livello prodotto)`,
        );
      if (!evaluateStock)
        missing.push('disponibilità a magazzino non valutata (nessun utente o peso stock=0)');
      getAnalyticsService().capture({
        distinctId: userId ?? 'system',
        event: 'products_recommended',
        properties: {
          result_count: recommendations.length,
          data_source: recommendations[0]?.source ?? 'none',
          excluded_revoked_count: excludedRevoked.length,
        },
      });
      return JSON.stringify({
        crop: search.crop?.nome ?? cropName,
        adversity: search.adversity?.nome ?? adversityName,
        candidatesEvaluated: recommendations.length,
        recommendations,
        excludedRevoked,
        dimensionsMissingData: missing,
        workingMemoryKey: 'recommendedProducts',
        nextRequiredTool: 'search_products',
        sources: [...new Set(recommendations.map((r) => r.source))],
        message: `Classificati ${recommendations.length} prodotti per "${adversityName}" su "${cropName}". Top-${topN.length} pre-caricati in inputProducts. Presenta come tabella e dichiara la fonte per prodotto; l'efficacia è una stima agronomica.`,
      });
    },
  });
}
