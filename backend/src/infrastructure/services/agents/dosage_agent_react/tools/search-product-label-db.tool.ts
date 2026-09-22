import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaLabelExtractionRepository } from '../../../../repositories/PrismaLabelExtractionRepository';
import { isFitoLabel, Label } from '../../../../../domain/dtos/label.dto';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { extractLabelFacts } from './label-facts';

const DEFAULT_LABEL_REFRESH_TTL_DAYS = 7;

/**
 * Tool: search_product_label_database
 * Searches the internal database of extracted ministerial product labels.
 * Returns rich label data including dosages, hazard statements, buffer zones,
 * resistance management, and more — much richer than BDF API.
 */
export function createSearchProductLabelDatabaseTool(threadId?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'search_product_label_database',
    description: `Cerca le etichette ministeriali dei prodotti fitosanitari nel database interno.
Restituisce dati COMPLETI dell'etichetta: dosi dettagliate per coltura/avversità, n. max applicazioni,
intervallo sicurezza, fasce di rispetto, frasi di pericolo (H), frasi di prudenza (P), avvertenze,
compatibilità, fitotossicità, gestione resistenze, meccanismo d'azione FRAC.
PRIORITÀ ALTA: usa questo tool PRIMA di bdf_search_product_doses per ottenere dati di etichetta.
Se il prodotto non è nel database, usa bdf_search_product_doses come fallback.`,
    schema: z.object({
      productName: z
        .string()
        .min(2)
        .describe(
          'Nome commerciale del prodotto (es. "Captano 80 WDG", "Chorus", "Epik SL"). Minimo 2 caratteri.',
        ),
      registrationNumber: z
        .string()
        .optional()
        .describe(
          'Numero di registrazione ministeriale (es. "15549"). Opzionale ma migliora la precisione.',
        ),
      cropName: z
        .string()
        .optional()
        .describe(
          'Coltura di interesse per filtrare i dosaggi dettagliati (es. "Melo", "Vite"). Se omessa, restituisce tutti i dosaggi.',
        ),
    }),
    func: async ({ productName, registrationNumber, cropName }) => {
      try {
        const repo = new PrismaLabelExtractionRepository(prisma);
        const results = await repo.searchByProductName({
          productName,
          registrationNumber,
          limit: 3,
        });

        if (results.length === 0) {
          return JSON.stringify({
            found: false,
            message: `Nessuna etichetta trovata nel database per "${productName}".`,
            recommendation:
              'Usa bdf_search_product_doses per cercare i dati nella Banca Dati Fitofarmaci.',
            searchedProductName: productName,
          });
        }

        // Filter to FITO labels only
        const fitoResults = results.filter((r) => isFitoLabel(r.label));
        if (fitoResults.length === 0) {
          return JSON.stringify({
            found: false,
            message: `Etichette trovate per "${productName}" ma nessuna è di tipo fitosanitario.`,
            recommendation: 'Usa bdf_search_product_doses come fallback.',
          });
        }

        const record = fitoResults[0];
        const label = record.label as Label;
        const freshness = getLabelFreshness(record.lastRefreshedAt);
        const labelFacts = extractLabelFacts({
          label,
          productName: record.productName,
          registrationNumber: record.registrationNumber,
          cropName,
          lastRefreshedAt: record.lastRefreshedAt,
          freshness: freshness.fresh ? 'fresh' : 'stale',
        });

        // Optionally filter dosaggi_dettagliati by crop
        let filteredDosaggi = label.dosaggi_dettagliati;
        if (cropName) {
          const cropLower = cropName.toLowerCase();
          const cropFiltered = label.dosaggi_dettagliati.filter(
            (d) =>
              d.coltura.toLowerCase().includes(cropLower) ||
              cropLower.includes(d.coltura.toLowerCase()),
          );
          if (cropFiltered.length > 0) {
            filteredDosaggi = cropFiltered;
          }
        }

        // Save full label to working memory (labelCache) if threadId is available
        if (threadId) {
          const existingCache = getWorkingMemory(threadId).labelCache ?? {};
          updateWorkingMemory(threadId, {
            labelCache: {
              ...existingCache,
              [record.registrationNumber]: {
                productName: record.productName,
                registrationNumber: record.registrationNumber,
                category: record.category,
                label,
              },
            },
          });
        }

        // Return compact summary to the LLM (full label in working memory)
        return JSON.stringify({
          found: true,
          productName: record.productName,
          registrationNumber: record.registrationNumber,
          category: record.category,
          principioAttivo: label.principio_attivo,
          meccanismoAzioneFrac: label.meccanismo_azione_frac,
          extractionConfidence: record.extractionConfidence,
          lastRefreshedAt: record.lastRefreshedAt?.toISOString() ?? null,
          labelFreshness: freshness,
          cropFilter: cropName ?? null,
          dosaggiCount: filteredDosaggi.length,
          totalDosaggiCount: label.dosaggi_dettagliati.length,
          coltureTargetCount: label.colture_target.length,
          dosaggiDettagliati: labelFacts.doseFacts,
          resistenzeCount: label.resistenze?.length ?? 0,
          fasceRispettoAcqua: labelFacts.bufferFacts.water,
          fasceRispettoColture: labelFacts.bufferFacts.crops,
          fasceDeriva: labelFacts.bufferFacts.drift,
          fasceStatus: labelFacts.bufferFacts.status,
          fasceMessage: labelFacts.bufferFacts.message,
          avvertenze: labelFacts.warnings,
          targetCrops: labelFacts.targetCrops,
          labelFacts,
          workingMemoryKey: threadId ? 'labelCache' : undefined,
          message: `Etichetta trovata per "${record.productName}" (Reg: ${record.registrationNumber}). ${filteredDosaggi.length} dosaggi${cropName ? ` filtrati per "${cropName}"` : ''}.${threadId ? ' Dati completi in working memory (labelCache).' : ''}`,
          source: 'etichetta_ministeriale_db',
          otherResults:
            fitoResults.length > 1
              ? fitoResults.slice(1).map((r) => ({
                  productName: r.productName,
                  registrationNumber: r.registrationNumber,
                }))
              : undefined,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({
          error: msg,
          recommendation: 'Usa bdf_search_product_doses come fallback.',
        });
      }
    },
  });
}

function getLabelFreshness(lastRefreshedAt: Date | null): {
  readonly fresh: boolean;
  readonly reason: string;
} {
  if (!lastRefreshedAt) {
    return {
      fresh: false,
      reason: 'Label has not yet been refreshed from the ministerial source.',
    };
  }
  const ttlDays = Number(process.env.LABEL_REFRESH_TTL_DAYS ?? DEFAULT_LABEL_REFRESH_TTL_DAYS);
  const maxAgeMs = Math.max(1, ttlDays) * 24 * 60 * 60 * 1000;
  const fresh = Date.now() - lastRefreshedAt.getTime() <= maxAgeMs;
  return {
    fresh,
    reason: fresh
      ? 'Label refresh is within the configured freshness window.'
      : 'Label refresh is older than the configured freshness window.',
  };
}
