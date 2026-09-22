/**
 * Tool: modify_plan_step
 * Modifies a single step of the active treatment plan.
 * Re-validates compliance for the modified step.
 *
 * Model complexity: MEDIUM (re-validation logic).
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import { toolError, toolMissingPrerequisite } from '../../shared/toolResult';
import type { ComplianceStatus } from '../type/plan';

export function createModifyPlanStepTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'modify_plan_step',
    description: `Modifica un singolo passo del piano di trattamento attivo.
Permette all'utente di cambiare prodotto, dose, data, avversità o altri parametri.
Richiede activePlan dalla working memory (eseguire prima generate_treatment_plan).
Dopo la modifica, il passo viene segnato come 'modified' e la conformità potrebbe cambiare.
Presenta il piano aggiornato all'utente dopo la modifica.`,
    schema: z.object({
      stepSequence: z
        .number()
        .describe('Numero di sequenza del passo da modificare (1-based, colonna # nella tabella)'),
      modifications: z.object({
        productName: z.string().optional().describe('Nuovo nome prodotto'),
        activeIngredient: z.string().optional().describe('Nuovo principio attivo'),
        dosePerHa: z.number().optional().describe('Nuova dose per ettaro'),
        doseUnit: z.string().optional().describe("Nuova unità di misura (es. 'kg/ha', 'L/ha')"),
        applicationDate: z
          .string()
          .optional()
          .describe('Nuova data (formato ISO, es. "2025-05-15")'),
        adversity: z.string().optional().describe('Nuova avversità bersaglio'),
      }),
      reason: z.string().describe('Motivo della modifica (richiesto per audit trail)'),
    }),
    func: async ({ stepSequence, modifications, reason }) => {
      try {
        if (!hasWorkingMemoryData(threadId, 'activePlan')) {
          return toolMissingPrerequisite(
            'activePlan',
            'Eseguire prima generate_treatment_plan per creare il piano.',
          );
        }

        const wm = getWorkingMemory(threadId);
        const plan = wm.activePlan!;

        // Find the step by sequence number
        const step = plan.steps.find((s) => s.sequence === stepSequence);
        if (!step) {
          return toolError(
            `Passo ${stepSequence} non trovato. Il piano ha ${plan.steps.length} passi (1-${plan.steps.length}).`,
          );
        }

        // Apply modifications
        if (modifications.productName !== undefined) {
          step.treatment.productName = modifications.productName;
        }
        if (modifications.activeIngredient !== undefined) {
          step.treatment.activeIngredient = modifications.activeIngredient;
        }
        if (modifications.dosePerHa !== undefined) {
          step.treatment.dosePerHa = modifications.dosePerHa;
          // Recalculate total quantity if area is available
          const target = plan.targets[0];
          if (target?.areaHa) {
            step.treatment.totalQuantity = modifications.dosePerHa * target.areaHa;
          }
        }
        if (modifications.doseUnit !== undefined) {
          step.treatment.doseUnit = modifications.doseUnit;
        }
        if (modifications.applicationDate !== undefined) {
          step.treatment.applicationDate = modifications.applicationDate;
        }
        if (modifications.adversity !== undefined) {
          step.treatment.adversity = modifications.adversity;
        }

        // Mark step as modified
        step.status = 'modified';
        step.userNote = reason;

        // Reset compliance to da_verificare after modification
        // (full re-validation would require calling validate_compliance again)
        step.compliance = {
          status: 'da_verificare' as ComplianceStatus,
          violations: [
            {
              message: `Passo modificato: ${reason}. Ri-validazione consigliata.`,
              severity: 'WARNING',
            },
          ],
        };

        // Update plan status
        plan.status = 'modified';
        plan.metadata.updatedAt = new Date().toISOString();

        // Recalculate overall compliance
        const conformSteps = plan.steps.filter((s) => s.compliance.status === 'conforme').length;
        const nonConformSteps = plan.steps.filter(
          (s) => s.compliance.status === 'non_conforme',
        ).length;
        plan.compliance = {
          overallStatus:
            nonConformSteps > 0
              ? 'non_conforme'
              : plan.steps.some((s) => s.compliance.status === 'da_verificare')
                ? 'da_verificare'
                : 'conforme',
          totalSteps: plan.steps.length,
          conformSteps,
          nonConformSteps,
          warnings: plan.steps
            .flatMap((s) => s.compliance.violations)
            .filter((v) => v.severity === 'WARNING')
            .map((v) => v.message),
        };

        // Save updated plan
        updateWorkingMemory(threadId, { activePlan: plan });

        // Build updated row for presentation
        const statusIcon =
          step.compliance.status === 'conforme'
            ? '✅'
            : step.compliance.status === 'non_conforme'
              ? '❌'
              : '⚠️';

        return JSON.stringify({
          planId: plan.id,
          modifiedStep: {
            sequence: step.sequence,
            productName: step.treatment.productName,
            activeIngredient: step.treatment.activeIngredient,
            dosePerHa: step.treatment.dosePerHa,
            doseUnit: step.treatment.doseUnit,
            applicationDate: step.treatment.applicationDate,
            compliance: `${statusIcon} ${step.compliance.status.toUpperCase()}`,
          },
          reason,
          planStatus: plan.status,
          overallCompliance: plan.compliance.overallStatus,
          message: `Passo ${stepSequence} modificato: ${reason}. Conformità da ri-verificare.`,
          hint: 'Per ri-validare la conformità, eseguire validate_compliance. Per approvare il piano, comunicare approvazione e chiamare execute_treatment_plan.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return toolError(msg);
      }
    },
  });
}
