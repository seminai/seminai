/**
 * Tool: generate_treatment_plan
 * Reads accumulated data from working memory and synthesizes a structured
 * TreatmentPlan that the user can review before execution.
 *
 * Model complexity: HIGH (reasoning-heavy synthesis).
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import { toolError, toolMissingPrerequisite } from '../../shared/toolResult';
import {
  buildTargets,
  buildSteps,
  buildCompliance,
  buildStockSummary,
  buildExcludedProductsSummary,
  buildMarkdownTable,
  buildUnitDisplayNameMap,
} from './plan-builder';
import {
  attachTreatmentEvidence,
  buildTreatmentEvidenceSummary,
} from './treatment-evidence-builder';
import type {
  DosageResultUnit,
  ComplianceViolationLike,
  StockBalanceLike,
} from './dosage-result-types';
import type { TreatmentPlan } from '../type/plan';
import { buildAgronomicPlanInput } from '../../dosage_agent/agronomicPlanInputBuilder';
import { validateAgronomicPlan } from '../../../../../domain/entities/agronomic-validation';
import type { UnitAllowedProductsWithDosageOutput } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';

export function createGeneratePlanTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'generate_treatment_plan',
    description: `Genera un piano strutturato di trattamento basato sui dati accumulati nella working memory.
Richiede ALMENO dosageResults dalla working memory (eseguire prima calculate_dosage).
Utilizza anche (se disponibili): complianceResult, stockBalance, matchedProducts, treatmentStrategy, labelCache.
Il piano include: prodotti, dosi, date, conformità per ogni passo, evidenze etichetta/disciplinare/deroghe, sommario stock.
Dopo la generazione, PRESENTARE il piano all'utente come tabella markdown per approvazione.
Se etichetta, disciplinare o deroghe/bollettini non sono verificati, lo step resta DA_VERIFICARE.
NON crea job nel database — è solo un piano di preview.`,
    schema: z.object({
      userRequest: z.string().describe("Richiesta originale dell'utente (per tracciamento)"),
      reasoning: z.string().optional().describe('Motivazione/ragionamento del piano (opzionale)'),
    }),
    func: async ({ userRequest, reasoning }) => {
      try {
        if (!hasWorkingMemoryData(threadId, 'dosageResults')) {
          return toolMissingPrerequisite(
            'dosageResults',
            'Eseguire prima calculate_dosage per calcolare i dosaggi.',
          );
        }

        const wm = getWorkingMemory(threadId);
        const dosageResults = (wm.dosageResults ?? []) as unknown as DosageResultUnit[];
        const complianceResult = wm.complianceResult as
          | { violations: ComplianceViolationLike[] }
          | undefined;
        const stockBalance = wm.stockBalance as StockBalanceLike | undefined;
        const unitDisplayNames = buildUnitDisplayNameMap(wm.inputUnits ?? []);

        const targets = buildTargets(dosageResults, unitDisplayNames);
        const rawSteps = buildSteps(dosageResults, complianceResult, unitDisplayNames);
        const agronomicValidation = validateAgronomicPlan({
          plan: buildAgronomicPlanInput({
            dosageResults: dosageResults as unknown as UnitAllowedProductsWithDosageOutput[],
          }),
        });
        const steps = attachTreatmentEvidence(rawSteps, {
          labelCache: wm.labelCache,
          complianceResult: wm.complianceResult,
          agronomicViolations: agronomicValidation.violations.map((v) => ({
            code: v.code,
            severity: v.severity,
            productName: v.productName,
            message: v.message,
          })),
        });

        if (steps.length === 0) {
          return toolError(
            'Nessun trattamento trovato nei dosageResults. Verificare che calculate_dosage abbia prodotto risultati.',
          );
        }

        const compliance = buildCompliance(steps);
        const stockSummary = buildStockSummary(stockBalance);
        const excludedProductsSummary = buildExcludedProductsSummary(
          dosageResults,
          unitDisplayNames,
        );
        const evidenceSummary = buildTreatmentEvidenceSummary(steps);
        const plan: TreatmentPlan = {
          id: uuidv4(),
          status: 'presented',
          metadata: {
            createdAt: new Date().toISOString(),
            userRequest,
            reasoning: reasoning ?? 'Piano generato automaticamente dai dati di working memory.',
            modelsUsed: [],
          },
          targets,
          steps,
          compliance,
          stockSummary,
          tokenUsage: { totalInput: 0, totalOutput: 0, byProvider: {} },
        };

        updateWorkingMemory(threadId, { activePlan: plan, agronomicValidation });

        return JSON.stringify({
          planId: plan.id,
          status: plan.status,
          totalSteps: steps.length,
          targets: targets.map((t) => `${t.cropName} (${t.areaHa} ha)`),
          compliance: compliance.overallStatus,
          conformSteps: compliance.conformSteps,
          nonConformSteps: compliance.nonConformSteps,
          stockIssues: stockSummary.hasIssues,
          excludedProductsCount: excludedProductsSummary.length,
          excludedProductsSummary,
          evidenceSummary,
          agronomicBlockingCount: agronomicValidation.blockingCount,
          agronomicWarningCount: agronomicValidation.warningCount,
          agronomicViolations: agronomicValidation.violations.map((v) => ({
            code: v.code,
            severity: v.severity,
            product: v.productName,
            crop: v.cropName,
            message: v.message,
          })),
          markdownTable: buildMarkdownTable(steps, stockSummary),
          workingMemoryKey: 'activePlan',
          message:
            `Piano generato con ${steps.length} trattamenti su ${targets.length} unità. Stato evidenze: ${compliance.overallStatus.toUpperCase()}.` +
            (agronomicValidation.blockingCount > 0
              ? ` ${agronomicValidation.blockingCount} violazioni agronomiche BLOCCANTI: vanno risolte o accettate dall'utente prima di create_treatment_jobs.`
              : '') +
            (excludedProductsSummary.length > 0
              ? ` Prodotti esclusi dal piano: ${excludedProductsSummary.length}.`
              : ''),
          hint: "Presentare il piano all'utente includendo etichetta, disciplinare/regole, deroghe/bollettini, fonti e verdetto. Può modificare singoli passi con modify_plan_step o approvare per eseguire con execute_treatment_plan.",
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return toolError(msg);
      }
    },
  });
}
