import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { flowCheckActiveIngredientCompatibility } from '../../dosage_agent/activeIngredientCompatibilityChecker';
import { JobHistoryManager } from '../../dosage_agent/historyCollector';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import type { DosageAgentContext } from '../../dosage_agent/context';

/**
 * Tool: check_compatibility
 * Checks active ingredient chemical compatibility between products.
 */
export function createCheckCompatibilityTool(
  threadId: string,
  context?: DosageAgentContext,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'check_compatibility',
    description: `Verifica la compatibilità chimica tra i principi attivi dei prodotti selezionati.
Rileva: incompatibilità chimiche, avvertenze di resistenza, suggerisce dosi alternative per prodotti sostitutivi.
Richiede dosageResults dalla working memory (eseguire prima calculate_dosage).
I prodotti incompatibili vengono segnalati con dose impostata a 0.`,
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
        const historyManager = new JobHistoryManager();

        const result = await flowCheckActiveIngredientCompatibility(
          dosageResults,
          historyManager,
          context,
        );

        // Update working memory
        updateWorkingMemory(threadId, { dosageResults: result });

        return JSON.stringify({
          unitsChecked: result.length,
          method: 'rule-based (resistenze etichetta) + analisi LLM supplementare',
          message:
            'Compatibilità principi attivi analizzata con regole da etichetta + LLM. ' +
            'Eventuali prodotti incompatibili sono stati segnalati con dose 0. ' +
            'NON è una matrice di compatibilità di miscela curata: per miscele critiche in vasca, ' +
            "consigliare all'utente la verifica manuale (prova di miscibilità / scheda tecnica).",
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
