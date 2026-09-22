import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory, hasWorkingMemoryData, updateWorkingMemory } from '../working-memory';
import type { UnitAllowedProductsWithDosageOutput } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { collectInvalidProductionUnitIds, invalidProductionUnitReferenceResult } from './production-unit-reference';
import { assertProductionUnitsAccess } from './authorization';
import { JobHistoryManager } from '../../dosage_agent/historyCollector';
import { validateAgronomicPlan } from '../../../../../domain/entities/agronomic-validation';
import { buildAgronomicPlanInput } from '../../dosage_agent/agronomicPlanInputBuilder';
import { getAnalyticsService } from '../../../analytics/analytics-service.singleton';
import { prisma } from '../../../../repositories/Prisma';
import { fillTheJob } from '../../dosage_agent/fillTheJob';
import type { RuleViolationDetail } from '../../../../../domain/dtos/rule-rag.types';
import { formatJobsTableMarkdown } from './format-jobs-table';
import { UnitSummary, buildAgronomicGateBlockedResult, buildUnitMetaMap, compactViolation } from './create-jobs.tool.part-01-unit-summary';

/**
 * Tool: create_treatment_jobs
 * Persists treatment jobs to the database. REQUIRES USER APPROVAL.
 */
export function createCreateJobsTool(threadId: string, userId?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_treatment_jobs',
    description: `Crea i job di trattamento nel database del sistema.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare questo tool, DEVI presentare un riepilogo dettagliato con:
- Lista prodotti con dosi e date
- Colture e superfici
- Eventuali violazioni o warning
L'utente deve confermare esplicitamente prima che i job vengano creati.
Richiede dosageResults dalla working memory.`,
    schema: z.object({
      queueJobId: z.string().optional().describe('ID del job nella coda (opzionale, per tracking)'),
      persist: z
        .boolean()
        .optional()
        .default(true)
        .describe('Se true (default), salva i job nel database. Se false, simula senza salvare.'),
      overrideViolationCodes: z
        .array(z.string())
        .optional()
        .describe(
          "Codici di violazione agronomica BLOCCANTE che l'utente ha esplicitamente accettato " +
            '(es. ["PHI_VIOLATION"]). Usare SOLO dopo conferma esplicita dell\'utente per ogni codice. ' +
            'Le violazioni non elencate continuano a bloccare la creazione.',
        ),
    }),
    func: async ({ queueJobId, persist, overrideViolationCodes }) => {
      try {
        if (!hasWorkingMemoryData(threadId, 'dosageResults')) {
          return JSON.stringify({
            error: 'Prerequisito mancante: dosageResults',
            hint: 'Eseguire prima calculate_dosage per calcolare i dosaggi.',
          });
        }

        const wm = getWorkingMemory(threadId);
        const dosageResults = (wm.dosageResults ??
          []) as unknown as UnitAllowedProductsWithDosageOutput[];
        const productionUnitIds = dosageResults
          .map((unit) => unit.unitProductionId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        const invalidUnitIds = collectInvalidProductionUnitIds(productionUnitIds);
        if (invalidUnitIds.length > 0) {
          return invalidProductionUnitReferenceResult(invalidUnitIds);
        }
        if (userId) {
          await assertProductionUnitsAccess(userId, productionUnitIds);
        }
        const historyManager = new JobHistoryManager();

        // Deterministic agronomic gate: re-validate the assembled plan against
        // label constraints (dose max, PHI, revocation) before persisting.
        const agronomicValidation = validateAgronomicPlan({
          plan: buildAgronomicPlanInput({ dosageResults }),
        });
        updateWorkingMemory(threadId, { agronomicValidation });
        const overrides = new Set(overrideViolationCodes ?? []);
        const unresolvedBlocking = agronomicValidation.violations.filter(
          (v) => v.severity === 'BLOCKING' && !overrides.has(v.code),
        );
        const gateEnforced = process.env.AGRONOMIC_GATE_ENFORCE !== 'false';
        if (persist && gateEnforced && unresolvedBlocking.length > 0) {
          getAnalyticsService().capture({
            distinctId: userId ?? 'system',
            event: 'agronomic_gate_blocked',
            properties: {
              blocking_count: unresolvedBlocking.length,
              violation_codes: unresolvedBlocking.map((v) => v.code),
            },
          });
          return buildAgronomicGateBlockedResult(unresolvedBlocking);
        }
        const acknowledgedBlocking = agronomicValidation.violations.filter(
          (v) => v.severity === 'BLOCKING' && overrides.has(v.code),
        );
        if (persist && acknowledgedBlocking.length > 0) {
          console.warn(
            `[AGRONOMIC-GATE] Override accettato per ${acknowledgedBlocking.length} violazioni bloccanti: ` +
              acknowledgedBlocking.map((v) => `${v.code}/${v.productName}`).join(', '),
          );
        }

        // Get compliance data if available
        const ruleViolations = wm.complianceResult?.violations;
        const disciplinareInfoMap = wm.complianceResult?.disciplinareInfoMap;
        const appliedRulesByProduct = wm.complianceResult?.appliedRulesByProduct;

        if (!persist) {
          // Dry run: just count what would be created
          let totalJobs = 0;
          for (const unit of dosageResults) {
            for (const product of unit.products ?? []) {
              totalJobs += (product.trattamenti ?? []).length;
            }
          }
          return JSON.stringify({
            dryRun: true,
            totalJobsToCreate: totalJobs,
            unitsInvolved: dosageResults.length,
            warnings: ruleViolations?.length
              ? `${ruleViolations.length} violazioni di conformità rilevate.`
              : null,
            agronomicBlockingCount: agronomicValidation.blockingCount,
            agronomicWarningCount: agronomicValidation.warningCount,
            agronomicViolations: agronomicValidation.violations.map(compactViolation),
            message: `Simulazione: verrebbero creati ${totalJobs} job su ${dosageResults.length} unità. Impostare persist=true per creare effettivamente.`,
          });
        }
        if (queueJobId) {
          const existingJobs = await prisma.job.findMany({
            where: { jobId: queueJobId },
            select: {
              id: true,
              productionUnitId: true,
            },
          });
          if (existingJobs.length > 0) {
            const jobsByUnit = new Map<string, number>();
            for (const job of existingJobs) {
              jobsByUnit.set(job.productionUnitId, (jobsByUnit.get(job.productionUnitId) ?? 0) + 1);
            }
            return JSON.stringify({
              totalJobsCreated: existingJobs.length,
              unitSummaries: [...jobsByUnit.entries()].map(([unitId, jobCount]) => ({
                unitId,
                jobCount,
              })),
              reusedExistingJobs: true,
              message: `Rilevate ${existingJobs.length} operazioni già create per questo gruppo. Operazione non ripetuta.`,
            });
          }
        }
        const result = await fillTheJob({
          units: dosageResults,
          requestedProducts: wm.inputProducts as Parameters<
            typeof fillTheJob
          >[0]['requestedProducts'],
          queueJobId,
          historyManager,
          ruleViolations: ruleViolations as RuleViolationDetail[] | undefined,
          disciplinareInfoMap: disciplinareInfoMap as Parameters<
            typeof fillTheJob
          >[0]['disciplinareInfoMap'],
          appliedRulesByProduct,
        });

        // Count created jobs
        let totalCreated = 0;
        const unitSummaries: UnitSummary[] = [];
        let groupId: string | null = null;
        for (const [unitId, jobs] of result.jobsByUnit) {
          totalCreated += jobs.length;
          unitSummaries.push({
            unitId,
            jobCount: jobs.length,
          });
          // All jobs in `jobsByUnit` share the same logical Job.jobId (set by
          // fillTheJob). Read it once from the first job we see.
          if (!groupId) {
            const firstJob = jobs[0];
            if (firstJob?.jobId) {
              groupId = firstJob.jobId;
            }
          }
        }

        // Build a human-readable table the assistant can include verbatim in
        // its final message. The user can copy/paste it into any spreadsheet.
        const unitMetaById = buildUnitMetaMap(wm.inputUnits);
        const tableMarkdown = formatJobsTableMarkdown({
          jobsByUnit: result.jobsByUnit,
          unitMetaById,
          groupId,
        });

        // Working memory: expose the freshly-created group so streaming-follow-ups
        // can render a "view in Archivio" suggestion.
        if (groupId) {
          updateWorkingMemory(threadId, { lastCreatedJobGroupId: groupId });
        }

        getAnalyticsService().capture({
          distinctId: userId ?? 'system',
          event: 'jobs_created',
          properties: {
            total_jobs: totalCreated,
            units_involved: unitSummaries.length,
            had_overrides: acknowledgedBlocking.length > 0,
          },
        });

        return JSON.stringify({
          totalJobsCreated: totalCreated,
          unitSummaries,
          warnings: result.warnings,
          agronomicWarnings: agronomicValidation.violations
            .filter((v) => v.severity === 'WARNING')
            .map(compactViolation),
          overriddenViolations: acknowledgedBlocking.map(compactViolation),
          jobGroupId: groupId,
          archiveLocation: groupId ? 'Archivio' : null,
          tableMarkdown,
          message:
            `Creati ${totalCreated} job di trattamento nel sistema. ` +
            `Includi la tabella seguente nella tua risposta finale all'utente ` +
            `e invita a validare il gruppo in Archivio.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

/**
 * Set of tool names that require user approval before execution.
 * @deprecated Use `classifyRisk()` + `shouldAutoApprove()` from `graph/risk-classifier.ts` instead.
 */
export const DESTRUCTIVE_TOOLS = new Set([
  'create_treatment_jobs',
  'execute_treatment_plan',
  'approve_field_note',
  // Entity creation tools
  'create_company',
  'create_fields',
  'create_production_units',
  'import_from_file',
  'import_stock_from_file',
  // Job management tools
  'update_job',
  'create_job',
  'merge_treatment_dates',
  'optimize_selected_jobs',
  // Conformity check confirmation
  'confirm_conformity_check',
  // Full dosage pipeline launcher
  'start_dosage_agent_job',
]);
