import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { flowValidateSAGroupLimits } from '../../dosage_agent/saGroupLimitsValidator';
import { JobHistoryManager } from '../../dosage_agent/historyCollector';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import type { DosageAgentContext } from '../../dosage_agent/context';

/**
 * Tool: validate_sa_group_limits
 * Validates maximum treatment counts per active substance group.
 */
export function createValidateSAGroupsTool(
  threadId: string,
  context?: DosageAgentContext,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'validate_sa_group_limits',
    description: `Verifica i limiti per gruppo di sostanze attive (SA Group) dai disciplinari.
Esempio: "Max 12 trattamenti tra Ditianon, Fluazinam e Folpet" (gruppo fungicidi di contatto).
Controlla che il numero totale di trattamenti per gruppo non superi il limite.
Richiede dosageResults dalla working memory (eseguire prima calculate_dosage).`,
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
        const normalizedUnits = (wm.inputUnits ?? wm.expandedUnits ?? []) as any[];
        const historyManager = new JobHistoryManager();

        const { units, diagnostics } = await flowValidateSAGroupLimits({
          units: dosageResults,
          normalizedUnits,
          historyManager,
          context,
        });

        // Update working memory with adjusted results + diagnostics
        updateWorkingMemory(threadId, { dosageResults: units, saGroupDiagnostics: diagnostics });

        return JSON.stringify({
          unitsValidated: units.length,
          missingDataUnitIds: diagnostics.missingDataUnitIds,
          annualExceedances: diagnostics.annualExceedances,
          message:
            'Limiti per gruppo di sostanze attive verificati e applicati. I dosaggi sono stati adeguati se necessario.' +
            (diagnostics.annualExceedances.length > 0
              ? ` ATTENZIONE: ${diagnostics.annualExceedances.length} limite/i ANNUALE/I superato/i sommando i trattamenti tra più cicli (nessun ciclo singolo lo supera) — segnalare all'utente.`
              : '') +
            (diagnostics.missingDataUnitIds.length > 0
              ? ` Nota: per ${diagnostics.missingDataUnitIds.length} unità i dati gruppi-SA non erano disponibili (controllo NON eseguito).`
              : ''),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
