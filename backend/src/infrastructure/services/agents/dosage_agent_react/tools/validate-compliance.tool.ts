import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CompanyRulesService } from '../../dosage_agent/companyRulesService';
import { flowValidateRulesCompliance } from '../../dosage_agent/flowValidateRulesCompliance';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import { buildSyntheticDosageContext, resolveCompanyContext } from './company-context-resolver';
import { withTimeout, TOOL_TIMEOUTS } from './timeout-utils';
import type { DosageAgentContext } from '../../dosage_agent/context';
import type { RuleViolationDetail } from '../../../../../domain/dtos/rule-rag.types';

/**
 * Tool: validate_compliance
 * Validates products and doses against regional disciplinari rules.
 */
export function createValidateComplianceTool(
  threadId: string,
  context?: DosageAgentContext,
  userId?: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'validate_compliance',
    description: `Verifica la conformità di prodotti e dosi con i disciplinari regionali vettorizzati.
Controlla: dosi massime, numero interventi, intervalli minimi, finestre fenologiche.
Richiede dosageResults dalla working memory (eseguire prima calculate_dosage).
Salva il risultato in working memory (complianceResult).
Segnala violazioni specifiche con gravità e suggerimenti correttivi.`,
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
        const dosageResults = [...(wm.dosageResults ?? [])];
        const resolvedCompany = resolveCompanyContext({ threadId, context });
        if (resolvedCompany.kind === 'multiple') {
          return JSON.stringify({
            status: 'MULTI_COMPANY_CONTEXT',
            companyIds: resolvedCompany.companyIds,
            error: 'Sono presenti più aziende nella working memory.',
            hint: 'Per piani multi-azienda usa start_dosage_agent_job, che applica le regole per azienda in modo isolato.',
          });
        }
        if (resolvedCompany.kind === 'none') {
          return JSON.stringify({
            status: 'NO_COMPANY_CONTEXT',
            violationsFound: 0,
            verdict:
              'DA VERIFICARE - Azienda non risolta, quindi le regole workspace non sono state applicate.',
            hint: 'Carica unità produttive di una singola azienda o passa da start_dosage_agent_job.',
          });
        }
        const effectiveContext = buildSyntheticDosageContext({
          threadId,
          userId,
          context,
          companyId: resolvedCompany.companyId,
        });
        if (!effectiveContext) {
          return JSON.stringify({
            status: 'NO_USER_CONTEXT',
            error: 'Impossibile validare le regole senza userId nel context del tool.',
          });
        }
        const companyRulesService = new CompanyRulesService();
        const vectorizedRules = await companyRulesService.getVectorizedRulesForCompany(
          resolvedCompany.companyId,
        );
        if (vectorizedRules.length === 0) {
          return JSON.stringify({
            status: 'NO_APPLICABLE_RULES',
            companyId: resolvedCompany.companyId,
            rulesApplied: 0,
            violationsFound: 0,
            verdict:
              'DA VERIFICARE - Nessuna regola ACTIVE assegnata e vectorizzata risulta applicabile alla azienda.',
            nextRequiredTool: 'list_effective_company_rules',
            message:
              'Non dichiaro il piano conforme: senza regole assegnate e vectorizzate la conformità deve essere verificata manualmente.',
          });
        }

        const result = await withTimeout(
          () => flowValidateRulesCompliance(effectiveContext, dosageResults),
          TOOL_TIMEOUTS.VALIDATE_COMPLIANCE,
          'validate_compliance',
        );

        updateWorkingMemory(threadId, {
          complianceResult: {
            violations: result.violations,
            disciplinareInfoMap: result.disciplinareInfoMap,
            appliedRulesByProduct: result.appliedRulesByProduct,
          },
          // Update dosage results with compliance adjustments
          dosageResults: result.output,
        });

        const violationSummary = result.violations.map((v: RuleViolationDetail) => ({
          rule: v.ruleName,
          severity: v.severity,
          category: v.ruleCategory,
          description: v.description,
          suggestedAction: v.suggestedAction,
        }));

        return JSON.stringify({
          status: 'VALIDATED',
          companyId: resolvedCompany.companyId,
          companyContextSource: resolvedCompany.source,
          rulesApplied: vectorizedRules.length,
          violationsFound: result.violations.length,
          violations: violationSummary,
          unitsAdjusted: result.output.length,
          workingMemoryKey: 'complianceResult',
          verdict:
            result.violations.length === 0
              ? '✅ CONFORME — Nessuna violazione rilevata.'
              : `❌ NON CONFORME — ${result.violations.length} violazione/i rilevata/e. Vedere dettagli.`,
          message:
            result.violations.length === 0
              ? 'Tutti i trattamenti sono conformi ai disciplinari regionali.'
              : `Trovate ${result.violations.length} violazioni. I dosaggi sono stati adeguati automaticamente dove possibile.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
