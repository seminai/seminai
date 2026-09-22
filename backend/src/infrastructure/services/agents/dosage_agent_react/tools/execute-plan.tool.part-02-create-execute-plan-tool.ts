import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import { toolError, toolMissingPrerequisite } from '../../shared/toolResult';
import { collectInvalidProductionUnitIds, invalidProductionUnitReferenceResult } from './production-unit-reference';
import { assertProductionUnitsAccess } from './authorization';
import { JobHistoryManager } from '../../dosage_agent/historyCollector';
import { PrismaDosageAgentJobRepository } from '../../../../repositories/PrismaDosageAgentJobRepository';
import { prisma } from '../../../../repositories/Prisma';
import { DosageAgentJobState } from '../../../../../domain/entities/DosageAgentJob';
import { fillTheJob } from '../../dosage_agent/fillTheJob';
import type { UnitAllowedProductsWithDosageOutput } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import type { RuleViolationDetail } from '../../../../../domain/dtos/rule-rag.types';
import type { PlanStepStatus } from '../type/plan';
import { DosageResultUnit, ExecutablePlanStep, UnitSummary, buildArchiveGroupName, createChatArchiveGroupId, filterDosageResultsByStepSequences } from './execute-plan.tool.part-01-dosage-result-unit';

export function createExecutePlanTool(threadId: string, userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'execute_treatment_plan',
    description: `Esegue il piano di trattamento approvato, creando i job nel database del sistema.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare questo tool, l'utente DEVE aver approvato il piano.
Richiede activePlan dalla working memory (eseguire prima generate_treatment_plan).
Supporta esecuzione parziale specificando i numeri di sequenza dei passi da eseguire.`,
    schema: z.object({
      stepSequences: z
        .array(z.number())
        .optional()
        .describe(
          'Numeri di sequenza dei passi da eseguire (1-based). Se omesso, esegue TUTTI i passi non-rejected.',
        ),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe('Se true, simula senza creare job nel database.'),
      queueJobId: z.string().optional().describe('ID del job nella coda (per tracking)'),
    }),
    func: async ({ stepSequences, dryRun, queueJobId }) => {
      let generatedGroupJobId: string | null = null;
      let archiveGroupCreated = false;

      try {
        if (!hasWorkingMemoryData(threadId, 'activePlan')) {
          return toolMissingPrerequisite(
            'activePlan',
            'Eseguire prima generate_treatment_plan per creare il piano.',
          );
        }

        if (!hasWorkingMemoryData(threadId, 'dosageResults')) {
          return toolMissingPrerequisite(
            'dosageResults',
            'I dosageResults sono necessari per la creazione dei job.',
          );
        }

        const wm = getWorkingMemory(threadId);
        const plan = wm.activePlan!;
        const dosageResults = [...(wm.dosageResults ?? [])] as unknown as DosageResultUnit[];

        // Authorization gate UPFRONT (before dryRun too) over the FULL set of
        // production units in dosageResults. Asserting on the superset protects
        // against info leak via dryRun output and is cheap (~1 query, ≤20 PU).
        const allUnitProductionIds = dosageResults
          .map((unit) => unit.unitProductionId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
        const invalidUnitIds = collectInvalidProductionUnitIds(allUnitProductionIds);
        if (invalidUnitIds.length > 0) {
          return invalidProductionUnitReferenceResult(invalidUnitIds);
        }
        if (allUnitProductionIds.length > 0) {
          await assertProductionUnitsAccess(userId, allUnitProductionIds);
        }
        console.info('[execute_plan] audit', {
          userId,
          planId: plan.id,
          productionUnitIds: allUnitProductionIds,
          dryRun: !!dryRun,
          timestamp: new Date().toISOString(),
        });

        // Determine which steps to execute
        const stepsToExecute = stepSequences
          ? plan.steps.filter((s) => stepSequences.includes(s.sequence) && s.status !== 'rejected')
          : plan.steps.filter((s) => s.status !== 'rejected');

        if (stepsToExecute.length === 0) {
          return toolError('Nessun passo da eseguire. Tutti i passi sono stati rifiutati.');
        }

        // Count jobs for dry run
        if (dryRun) {
          return JSON.stringify({
            dryRun: true,
            planId: plan.id,
            stepsToExecute: stepsToExecute.length,
            totalSteps: plan.steps.length,
            skippedSteps: plan.steps.length - stepsToExecute.length,
            steps: stepsToExecute.map((s) => ({
              sequence: s.sequence,
              product: s.treatment.productName,
              date: s.treatment.applicationDate,
              dose: `${s.treatment.dosePerHa} ${s.treatment.doseUnit}`,
            })),
            message: `Simulazione: verrebbero creati ${stepsToExecute.length} job. Impostare dryRun=false per creare effettivamente.`,
          });
        }

        // Mark plan as executing
        plan.status = 'executing';
        updateWorkingMemory(threadId, { activePlan: plan });

        // Filter dosageResults to only include treatments for the selected steps
        const effectiveSequences = stepsToExecute.map((s) => s.sequence);
        const unitsToExecute = stepSequences
          ? filterDosageResultsByStepSequences(dosageResults, effectiveSequences)
          : dosageResults;

        // Execute using fillTheJob with filtered dosageResults
        const historyManager = new JobHistoryManager();
        const ruleViolations = wm.complianceResult?.violations;
        const disciplinareInfoMap = wm.complianceResult?.disciplinareInfoMap;
        const existingQueueJobId =
          typeof queueJobId === 'string' && queueJobId.trim().length > 0
            ? queueJobId.trim()
            : undefined;
        const groupJobId = existingQueueJobId ?? createChatArchiveGroupId(threadId);
        const archiveGroupName = buildArchiveGroupName(
          stepsToExecute as ExecutablePlanStep[],
          unitsToExecute.length,
          new Date(),
        );

        if (!existingQueueJobId) {
          archiveGroupCreated = true;
          generatedGroupJobId = groupJobId;
          const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);
          await dosageAgentJobRepository.updateStatus({
            jobId: groupJobId,
            userId,
            state: DosageAgentJobState.ACTIVE,
            progress: 0,
            failedReason: null,
            processedOn: new Date(),
            name: archiveGroupName,
          });
        }

        const result = await fillTheJob({
          units: unitsToExecute as unknown as UnitAllowedProductsWithDosageOutput[],
          requestedProducts: wm.inputProducts as Parameters<
            typeof fillTheJob
          >[0]['requestedProducts'],
          queueJobId: groupJobId,
          historyManager,
          ruleViolations: ruleViolations as RuleViolationDetail[] | undefined,
          disciplinareInfoMap: disciplinareInfoMap as Parameters<
            typeof fillTheJob
          >[0]['disciplinareInfoMap'],
        });

        // Count created jobs and build summary
        let totalCreated = 0;
        const unitSummaries: UnitSummary[] = [];
        for (const [unitId, jobs] of result.jobsByUnit) {
          totalCreated += jobs.length;
          unitSummaries.push({
            unitId,
            jobCount: jobs.length,
          });
        }

        if (archiveGroupCreated) {
          const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);
          await dosageAgentJobRepository.updateStatus({
            jobId: groupJobId,
            userId,
            state: DosageAgentJobState.COMPLETED,
            progress: 100,
            failedReason: null,
            finishedOn: new Date(),
            name: archiveGroupName,
          });
        }

        // Mark executed steps
        for (const step of stepsToExecute) {
          step.status = 'executed' as PlanStepStatus;
        }

        // Update plan status
        const allExecuted = plan.steps.every(
          (s) => s.status === 'executed' || s.status === 'rejected',
        );
        plan.status = allExecuted ? 'completed' : 'executing';
        plan.metadata.updatedAt = new Date().toISOString();
        updateWorkingMemory(threadId, { activePlan: plan });

        return JSON.stringify({
          planId: plan.id,
          planStatus: plan.status,
          groupJobId,
          archiveGroupCreated,
          totalJobsCreated: totalCreated,
          operationCount: totalCreated,
          archiveOperationsCount: totalCreated,
          stepsExecuted: stepsToExecute.length,
          unitSummaries,
          warnings: result.warnings,
          message: `Piano eseguito: create ${totalCreated} operazioni di trattamento su ${unitSummaries.length} unità nel gruppo Archivio.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';

        if (archiveGroupCreated && generatedGroupJobId) {
          try {
            const dosageAgentJobRepository = new PrismaDosageAgentJobRepository(prisma);
            await dosageAgentJobRepository.updateStatus({
              jobId: generatedGroupJobId,
              userId,
              state: DosageAgentJobState.FAILED,
              progress: 100,
              failedReason: msg,
              finishedOn: new Date(),
            });
          } catch (statusError) {
            console.warn('[execute_plan] failed to mark generated archive group as failed', {
              groupJobId: generatedGroupJobId,
              error: statusError instanceof Error ? statusError.message : String(statusError),
            });
          }
        }

        // Revert plan status on error
        const wm = getWorkingMemory(threadId);
        if (wm.activePlan) {
          wm.activePlan.status = 'approved';
          updateWorkingMemory(threadId, { activePlan: wm.activePlan });
        }

        return toolError(msg);
      }
    },
  });
}
