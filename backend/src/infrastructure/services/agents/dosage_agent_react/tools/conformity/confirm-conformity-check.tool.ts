import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { confirmConformityCheck } from '../../../conformity_checker_agent';
import { getWorkingMemory, hasWorkingMemoryData } from '../../working-memory';

/**
 * Tool: confirm_conformity_check
 * Applies the proposals from run_conformity_check to the database.
 * DESTRUCTIVE — requires user approval.
 */
export function createConfirmConformityCheckTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'confirm_conformity_check',
    description: `Applica le proposte di correzione conformità al database in una transazione atomica.
⚠️ RICHIEDE APPROVAZIONE DELL'UTENTE.
Prerequisito: run_conformity_check deve essere stato eseguito prima.
I job esclusi (dose=0) vengono marcati con nota [ESCLUSO].
I job corretti ricevono la nuova quantità e le alert notes aggiornate.`,
    schema: z.object({
      jobIds: z
        .array(z.string())
        .optional()
        .describe('Subset di jobId da confermare. Se vuoto, conferma tutti i job del gruppo.'),
    }),
    func: async ({ jobIds }) => {
      try {
        if (!hasWorkingMemoryData(threadId, 'conformityCheckResult')) {
          return JSON.stringify({
            error: 'Prerequisito mancante: conformityCheckResult',
            hint: 'Eseguire prima run_conformity_check per generare le proposte.',
          });
        }

        const wm = getWorkingMemory(threadId);
        const checkResult = wm.conformityCheckResult!;

        const result = await confirmConformityCheck({
          jobGroupId: checkResult.jobGroupId,
          jobIds,
          proposals: checkResult.proposals,
        });

        return JSON.stringify({
          jobGroupId: result.jobGroupId,
          updatedJobsCount: result.updatedJobsCount,
          excludedJobsCount: result.excludedJobsCount,
          errorCount: result.errorCount,
          updatedJobIds: result.updatedJobIds,
          jobResults: result.jobResults.map((jr) => ({
            jobId: jr.jobId,
            product: jr.productName,
            status: jr.status,
            wasExcluded: jr.wasExcluded,
            originalQuantity: jr.originalQuantity,
            finalQuantity: jr.finalQuantity,
            unit: jr.unitOfMeasure,
            errorMessage: jr.errorMessage,
          })),
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}
