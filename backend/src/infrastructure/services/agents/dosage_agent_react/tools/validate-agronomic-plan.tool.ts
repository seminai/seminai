import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { validateAgronomicPlan } from '../../../../../domain/entities/agronomic-validation';
import { buildAgronomicPlanInput } from '../../dosage_agent/agronomicPlanInputBuilder';
import type { UnitAllowedProductsWithDosageOutput } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { getWorkingMemory, hasWorkingMemoryData, updateWorkingMemory } from '../working-memory';
import { getAnalyticsService } from '../../../analytics/analytics-service.singleton';

/**
 * Tool: validate_agronomic_plan
 * Deterministic agronomic validation of the assembled dosage plan: detects
 * doses above the label maximum, pre-harvest interval (PHI) breaches, revoked
 * products, and dose rows that cannot be confidently resolved. Read-only.
 */
export function createValidateAgronomicPlanTool(
  threadId: string,
  userId?: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'validate_agronomic_plan',
    description: `Validazione agronomica deterministica del piano di trattamento.
Controlla in codice (non via LLM):
- dose oltre il massimo autorizzato da etichetta (BLOCCANTE)
- violazione del tempo di carenza/PHI rispetto alla data di raccolta (BLOCCANTE)
- prodotti revocati dal Ministero (BLOCCANTE)
- righe di dosaggio non abbinabili con certezza alla coltura (BLOCCANTE, fail-closed)
Richiede dosageResults dalla working memory (eseguire prima calculate_dosage/optimize_dosage).
È SOLA LETTURA: non modifica i dosaggi. Eseguirlo PRIMA di create_treatment_jobs.`,
    schema: z.object({}),
    func: async () => {
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
        const plan = buildAgronomicPlanInput({ dosageResults });
        const result = validateAgronomicPlan({ plan });
        updateWorkingMemory(threadId, { agronomicValidation: result });

        const blocking = result.violations.filter((v) => v.severity === 'BLOCKING');
        getAnalyticsService().capture({
          distinctId: userId ?? 'system',
          event: 'agronomic_plan_validated',
          properties: {
            blocking_count: result.blockingCount,
            warning_count: result.warningCount,
          },
        });
        return JSON.stringify({
          blockingCount: result.blockingCount,
          warningCount: result.warningCount,
          checksRun: result.checksRun,
          violations: result.violations.map((v) => ({
            code: v.code,
            severity: v.severity,
            product: v.productName,
            crop: v.cropName,
            observed: v.observed,
            limit: v.limit,
            message: v.message,
          })),
          message:
            blocking.length > 0
              ? `Rilevate ${blocking.length} violazioni BLOCCANTI: presentarle all'utente e NON creare i job finché non vengono risolte o esplicitamente accettate.`
              : result.warningCount > 0
                ? `Nessuna violazione bloccante. ${result.warningCount} warning da segnalare all'utente.`
                : 'Piano conforme ai vincoli agronomici verificati (dose max, PHI, revoche).',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
