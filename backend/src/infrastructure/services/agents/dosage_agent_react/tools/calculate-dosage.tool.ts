import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { flowMatchCropTreatment } from '../../dosage_agent/flowMatchCropTreatment';
import { flowMatchProductionUnitTreatmentDosageV2 } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from '../../dosage_agent/historyCollector';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import { buildSearchProductsFingerprint } from './search-products.tool';
import { resolveCompanyRuleDosageSettings } from './company-rule-dosage-settings';
import { withTimeout, TOOL_TIMEOUTS } from './timeout-utils';
import type { DosageAgentContext } from '../../dosage_agent/context';
import type { InputDosageAgent } from '../../dosage_agent/types';
import { mapUnitsToJobInput, type JobUnitSource } from './map-units-to-job-input';

type MemoryProductInput = {
  productName?: string;
  name?: string;
  registrationNumber?: string | null;
  quantity?: number;
  stockAvailable?: number;
  quantityUnitOfMeasure?: string;
  stockUnit?: string;
};

type MemoryUnitInput = JobUnitSource;

function toIsoDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function buildInputFromWorkingMemory(
  products: readonly unknown[],
  units: readonly unknown[],
): InputDosageAgent {
  const mappedProducts = products.map((raw) => {
    const p = raw as MemoryProductInput;
    return {
      productName: p.productName ?? p.name ?? '',
      registrationNumber: p.registrationNumber ?? '',
      quantity: p.quantity ?? p.stockAvailable ?? 0,
      quantityUnitOfMeasure: p.quantityUnitOfMeasure ?? p.stockUnit ?? 'kg',
    };
  });

  const mappedUnits = mapUnitsToJobInput(units as MemoryUnitInput[]);

  return {
    products: mappedProducts as InputDosageAgent['products'],
    unitOfProduction: mappedUnits as InputDosageAgent['unitOfProduction'],
  };
}

/**
 * Tool: calculate_dosage
 * Calculates treatment dates and doses for matched products.
 */
export function createCalculateDosageTool(
  threadId: string,
  context?: DosageAgentContext,
  userId?: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'calculate_dosage',
    description: `Calcola date e dosi dei trattamenti per ogni prodotto su ogni unità produttiva.
Usa fenologia della coltura, dati di etichetta e strategia per pianificare gli interventi.
Richiede matchedProducts dalla working memory (eseguire prima search_products).
Salva il risultato in working memory (dosageResults).`,
    schema: z.object({
      strategy: z
        .enum(['min', 'max', 'avg', 'current'])
        .optional()
        .default('avg')
        .describe(
          'Strategia di dosaggio: min (dose minima), max (dose massima), avg (media), current (dose attuale)',
        ),
      outStockLimiter: z
        .boolean()
        .optional()
        .default(false)
        .describe('Se true, scala le dosi per rispettare lo stock disponibile'),
      startAt: z
        .string()
        .optional()
        .describe('Data inizio finestra di pianificazione (ISO, es. "2025-03-01")'),
      endAt: z
        .string()
        .optional()
        .describe('Data fine finestra di pianificazione (ISO, es. "2025-10-31")'),
    }),
    func: async ({ strategy, outStockLimiter, startAt, endAt }) => {
      try {
        const wm = getWorkingMemory(threadId);
        const baseInput = buildInputFromWorkingMemory(wm.inputProducts ?? [], wm.inputUnits ?? []);
        const effectiveSettings = await resolveCompanyRuleDosageSettings({
          threadId,
          context,
          userId,
          input: baseInput,
          strategy,
          outStockLimiter,
          startAt,
          endAt,
        });
        if (effectiveSettings.kind === 'multiple') {
          return JSON.stringify({
            status: 'MULTI_COMPANY_CONTEXT',
            companyIds: effectiveSettings.companyIds,
            error: 'Sono presenti più aziende nella working memory.',
            hint: 'Per piani multi-azienda usa start_dosage_agent_job, che applica le regole per azienda in modo isolato.',
          });
        }
        updateWorkingMemory(threadId, {
          companyRuleConfigDiagnostics: effectiveSettings.companyRuleDiagnostics,
        });
        let matchedProductsInvalidated = false;
        if (
          hasWorkingMemoryData(threadId, 'matchedProducts') &&
          wm.matchedProductsDosageContextFingerprint !== effectiveSettings.dosageContextFingerprint
        ) {
          updateWorkingMemory(threadId, {
            matchedProducts: undefined,
            matchedProductsFingerprint: undefined,
            matchedProductsDosageContextFingerprint: undefined,
            dosageResults: undefined,
            complianceResult: undefined,
            agronomicValidation: undefined,
            saGroupDiagnostics: undefined,
            stockBalance: undefined,
            activePlan: undefined,
          });
          matchedProductsInvalidated = true;
        }
        let autoMatchedProducts = false;

        if (!hasWorkingMemoryData(threadId, 'matchedProducts')) {
          const input = effectiveSettings.input;
          if (input.products.length === 0 || input.unitOfProduction.length === 0) {
            return JSON.stringify({
              error: 'Prerequisito mancante: matchedProducts',
              hint: 'Eseguire prima list_company_products e list_production_units, poi search_products per abbinare prodotti a colture.',
            });
          }

          const searchProducts = input.products.map((p) => ({
            productName: p.productName,
            registrationNumber: p.registrationNumber,
            quantity: p.quantity,
            quantityUnitOfMeasure: p.quantityUnitOfMeasure,
          }));
          const searchUnits = input.unitOfProduction.map((u) => ({
            id: String(u.id ?? ''),
            cropName: String((u as { cropName?: string }).cropName ?? ''),
            variety: (u as { variety?: string }).variety,
            areaHa: (u as { areaHa?: number }).areaHa,
            startDate: toIsoDate((u as { startDate?: string | Date | null }).startDate),
            endDate: toIsoDate((u as { endDate?: string | Date | null }).endDate),
          }));
          const fingerprint = buildSearchProductsFingerprint(searchProducts, searchUnits);

          const matchHistoryManager = new JobHistoryManager();
          const matched = await withTimeout(
            () => flowMatchCropTreatment(input, matchHistoryManager, effectiveSettings.context),
            TOOL_TIMEOUTS.SEARCH_PRODUCTS,
            'calculate_dosage:auto_search_products',
          );

          updateWorkingMemory(threadId, {
            matchedProducts: matched,
            matchedProductsFingerprint: fingerprint,
            matchedProductsDosageContextFingerprint: effectiveSettings.dosageContextFingerprint,
          });
          autoMatchedProducts = true;
        } else if (
          wm.matchedProductsDosageContextFingerprint !== effectiveSettings.dosageContextFingerprint
        ) {
          updateWorkingMemory(threadId, {
            matchedProductsDosageContextFingerprint: effectiveSettings.dosageContextFingerprint,
          });
        }

        const matchedProducts = [...(wm.matchedProducts ?? [])];
        const historyManager = new JobHistoryManager();

        const result = await withTimeout(
          () =>
            flowMatchProductionUnitTreatmentDosageV2(
              matchedProducts,
              effectiveSettings.strategy,
              historyManager,
              effectiveSettings.outStockLimiter,
              effectiveSettings.planningWindow,
              effectiveSettings.context,
              effectiveSettings.orchestrator,
            ),
          TOOL_TIMEOUTS.CALCULATE_DOSAGE,
          'calculate_dosage',
        );

        updateWorkingMemory(threadId, { dosageResults: result });

        // Build summary for the agent
        const summary = result.map((unit) => {
          const productSummaries = (unit.products ?? []).map((p) => {
            const treatments = p.trattamenti ?? [];
            return {
              name: p.name,
              regNumber: p.regNumber,
              treatmentCount: treatments.length,
              noTreatmentReason: p.noTreatmentReason ?? null,
              treatments: treatments.slice(0, 5).map((t) => ({
                date: t.data_distribuzione,
                dose: t.dose,
                unit: t.dosaggio_um,
                epoch: t.epoca_impiego,
                ddtOk: t.ddt_date_is_ok,
              })),
            };
          });

          return {
            unitId: unit.unitProductionId,
            cropName: unit.cropName,
            areaHa: unit.areaHa,
            totalProducts: unit.products?.length ?? 0,
            totalTreatments: productSummaries.reduce((sum, p) => sum + p.treatmentCount, 0),
            products: productSummaries,
          };
        });

        const totalTreatments = summary.reduce((s, u) => s + u.totalTreatments, 0);

        return JSON.stringify({
          unitsProcessed: result.length,
          totalTreatments,
          strategy: effectiveSettings.strategy,
          outStockLimiter: effectiveSettings.outStockLimiter,
          companyId: effectiveSettings.companyId,
          companyContextSource: effectiveSettings.companyContextSource,
          companyRulesApplied: effectiveSettings.companyRulesApplied,
          companyRuleDiagnostics: effectiveSettings.companyRuleDiagnostics,
          dosageContextFingerprint: effectiveSettings.dosageContextFingerprint,
          summary,
          autoMatchedProducts,
          matchedProductsInvalidated,
          workingMemoryKey: 'dosageResults',
          nextRequiredTool: 'generate_treatment_plan',
          nextRequiredAction:
            'Chiama generate_treatment_plan e presenta la tabella markdown completa all’utente prima di creare operazioni.',
          message: `Calcolati ${totalTreatments} trattamenti su ${result.length} unità con strategia "${effectiveSettings.strategy}".`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
