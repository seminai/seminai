import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { flowMatchCropTreatment } from '../../dosage_agent/flowMatchCropTreatment';
import { JobHistoryManager } from '../../dosage_agent/historyCollector';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { withTimeout, TOOL_TIMEOUTS } from './timeout-utils';
import type { DosageAgentContext } from '../../dosage_agent/context';
import type { InputDosageAgent } from '../../dosage_agent/types';
import {
  mapUnitsToJobInput,
  mergeJobUnitSources,
  type JobUnitSource,
} from './map-units-to-job-input';
import { assertProductionUnitsAccess } from './authorization';
import {
  collectInvalidProductionUnitIds,
  invalidProductionUnitReferenceResult,
} from './production-unit-reference';

type SearchProductInput = {
  productName: string;
  registrationNumber?: string;
  quantity?: number;
  quantityUnitOfMeasure?: string;
};

type SearchUnitInput = {
  id: string;
  cropName: string;
  variety?: string;
  areaHa?: number;
  startDate?: string;
  endDate?: string;
};

export function buildSearchProductsFingerprint(
  products: readonly SearchProductInput[],
  units: readonly SearchUnitInput[],
): string {
  const normalizedProducts = products
    .map((p) => ({
      name: p.productName.trim().toLowerCase(),
      reg: String(p.registrationNumber ?? '').trim(),
      quantity: Number(p.quantity ?? 0),
      unit: String(p.quantityUnitOfMeasure ?? 'kg')
        .trim()
        .toLowerCase(),
    }))
    .sort((a, b) => `${a.name}|${a.reg}`.localeCompare(`${b.name}|${b.reg}`));
  const normalizedUnits = units
    .map((u) => ({
      id: u.id,
      crop: String(u.cropName ?? '')
        .trim()
        .toLowerCase(),
      variety: String(u.variety ?? '')
        .trim()
        .toLowerCase(),
      areaHa: Number(u.areaHa ?? 0),
      startDate: u.startDate ?? '',
      endDate: u.endDate ?? '',
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({ products: normalizedProducts, units: normalizedUnits });
}

/**
 * Tool: search_products
 * Matches products to crops, extracts labels, and finds compatible product-crop pairs.
 */
export function createSearchProductsTool(
  threadId: string,
  context?: DosageAgentContext,
  userId?: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'search_products',
    description: `Abbina prodotti fitosanitari a colture ed estrae le etichette ministeriali.
Verifica la compatibilità prodotto-coltura e carica i dati completi di etichetta (dosi, carenze, modalità applicazione).
Salva il risultato in working memory (matchedProducts).
Input: lista prodotti con nome/numero registrazione e unità produttive con coltura.`,
    schema: z.object({
      products: z
        .array(
          z.object({
            productName: z.string().describe('Nome commerciale del prodotto'),
            registrationNumber: z
              .string()
              .optional()
              .describe('Numero di registrazione ministeriale'),
            quantity: z.number().optional().describe('Quantità disponibile'),
            quantityUnitOfMeasure: z
              .string()
              .optional()
              .default('kg')
              .describe('Unità di misura della quantità (kg, L, etc.)'),
          }),
        )
        .describe('Lista dei prodotti da abbinare'),
      unitOfProduction: z
        .array(
          z.object({
            id: z.string().describe('ID unità di produzione'),
            cropName: z.string().describe('Nome della coltura (es. "Melo", "Vite")'),
            variety: z.string().optional().describe('Varietà colturale'),
            areaHa: z.number().optional().describe('Superficie in ettari'),
            startDate: z.string().optional().describe('Data inizio ciclo (ISO)'),
            endDate: z.string().optional().describe('Data fine ciclo (ISO)'),
          }),
        )
        .describe('Lista delle unità di produzione'),
    }),
    func: async ({ products, unitOfProduction }) => {
      try {
        const unitIds = (unitOfProduction as SearchUnitInput[]).map((unit) => unit.id);
        const invalidUnitIds = collectInvalidProductionUnitIds(unitIds);
        if (invalidUnitIds.length > 0) {
          return invalidProductionUnitReferenceResult(invalidUnitIds, {
            message:
              'Riferimento unita produttiva non valido: usa una unita reale restituita da list_production_units.',
            hint: 'Esegui list_production_units e seleziona una delle unita trovate. Non usare il nome coltura come riferimento tecnico.',
          });
        }

        const effectiveUserId = userId ?? context?.userId;
        if (effectiveUserId && unitIds.length > 0) {
          try {
            await assertProductionUnitsAccess(effectiveUserId, unitIds);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Errore autorizzazione unita';
            return invalidProductionUnitReferenceResult(unitIds, {
              message:
                'Una o piu unita produttive non sono accessibili per questo utente o non esistono.',
              reason: msg,
              hint: "Esegui list_production_units per l'azienda corretta e usa solo le unita restituite dal tool.",
            });
          }
        }

        const fingerprint = buildSearchProductsFingerprint(products, unitOfProduction);
        const wm = getWorkingMemory(threadId);
        if (
          wm.matchedProducts &&
          wm.matchedProducts.length > 0 &&
          wm.matchedProductsFingerprint === fingerprint
        ) {
          const summary = wm.matchedProducts.map((unit) => ({
            unitId: unit.unitProductionId,
            cropName: unit.cropName,
            areaHa: unit.areaHa,
            matchedProductCount: unit.products?.length ?? 0,
            excludedCount: unit.excludedProducts?.length ?? 0,
          }));

          return JSON.stringify({
            unitsProcessed: wm.matchedProducts.length,
            summary,
            cachedFromWorkingMemory: true,
            workingMemoryKey: 'matchedProducts',
            message:
              'Prodotti già abbinati in questa conversazione con gli stessi input. Riutilizzo il risultato senza nuove chiamate a SIAN/BDF/LLM.',
          });
        }

        const historyManager = new JobHistoryManager();
        const mergedUnits = mergeJobUnitSources(
          unitOfProduction as JobUnitSource[],
          (wm.inputUnits ?? []) as JobUnitSource[],
        );
        const input: InputDosageAgent = {
          products: products.map((p: SearchProductInput) => ({
            productName: p.productName,
            registrationNumber: p.registrationNumber,
            quantity: p.quantity ?? 0,
            quantityUnitOfMeasure: p.quantityUnitOfMeasure ?? 'kg',
          })) as InputDosageAgent['products'],
          unitOfProduction: mapUnitsToJobInput(mergedUnits) as InputDosageAgent['unitOfProduction'],
        };

        updateWorkingMemory(threadId, {
          inputProducts: input.products,
          inputUnits: input.unitOfProduction,
        });

        const result = await withTimeout(
          () => flowMatchCropTreatment(input, historyManager, context),
          TOOL_TIMEOUTS.SEARCH_PRODUCTS,
          'search_products',
        );

        updateWorkingMemory(threadId, {
          matchedProducts: result,
          matchedProductsFingerprint: fingerprint,
        });

        // Build summary for the agent
        const summary = result.map((unit) => ({
          unitId: unit.unitProductionId,
          cropName: unit.cropName,
          areaHa: unit.areaHa,
          matchedProductCount: unit.products?.length ?? 0,
          products: (unit.products ?? []).map((p) => ({
            name: (p as any).productName ?? (p as any).name,
            regNumber: (p as any).registrationNumber ?? (p as any).regNumber,
            hasLabel: !!(p as any).label,
            category: (p as any).label?.categoria ?? 'N/A',
          })),
          excludedCount: unit.excludedProducts?.length ?? 0,
        }));

        return JSON.stringify({
          unitsProcessed: result.length,
          summary,
          workingMemoryKey: 'matchedProducts',
          message: `${result.length} unità processate. Prodotti abbinati con etichette estratte.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
