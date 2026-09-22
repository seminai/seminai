import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDosageSubagentQueue } from '../../../../queue/DosageSubagentQueue';
import { getWorkingMemory } from '../working-memory';
import type { InputDosageAgent } from '../../dosage_agent';

const SpawnSubagentInputSchema = z.object({
  task: z.string().describe('Descrizione del task da delegare al sub-agente'),
  unitIds: z
    .array(z.string())
    .optional()
    .describe('IDs delle unità di produzione da processare (default: tutte quelle in WM)'),
  products: z
    .array(
      z.object({
        name: z.string(),
        registrationNumber: z.string().optional(),
      }),
    )
    .optional()
    .describe('Prodotti da considerare (default: quelli in WM)'),
  strategy: z
    .enum(['min', 'max', 'avg', 'current'])
    .default('avg')
    .describe('Strategia per i dosaggi'),
});

type SpawnSubagentInput = z.infer<typeof SpawnSubagentInputSchema>;

/**
 * Tool: spawn_subagent
 *
 * Enqueues a background BullMQ job that runs `runFlowsMultiCompany` on a
 * subset of the current thread's working memory (units + products), and
 * writes the result back to `spawnSubagentResults` on the same thread's WM.
 *
 * The model is expected to poll the result via `get_working_memory_details`
 * after a short delay. The job id is returned only for internal tracking.
 *
 * Fallback: when `SKIP_QUEUE=true` is set (dev without Redis), the tool
 * short-circuits to a `disabled` reply so the model knows to fall back to
 * the inline `calculate_dosage` + `optimize_dosage` workflow.
 */
export function createSpawnSubagentTool(threadId: string, userId: string): DynamicStructuredTool {
  const skipQueue = process.env.SKIP_QUEUE === 'true';

  return new DynamicStructuredTool({
    name: 'spawn_subagent',
    description: skipQueue
      ? 'NON DISPONIBILE in questo ambiente (queue disabilitata). Usa calculate_dosage + optimize_dosage inline al posto di delegare.'
      : "Delega un'operazione pesante (es. calcolo dosaggi su molte unità produttive) a un sub-agente in background. " +
        "Il sub-agente eseguirà l'operazione e scriverà i risultati in working memory sotto la chiave " +
        '`spawnSubagentResults`. Controlla i risultati con `get_working_memory_details` dopo ~10-30s. ' +
        'Usa quando il numero di unità produttive × prodotti è elevato (>20 combinazioni).',
    schema: SpawnSubagentInputSchema,
    func: async (input: SpawnSubagentInput): Promise<string> => {
      if (skipQueue) {
        return JSON.stringify({
          status: 'disabled',
          message:
            'BullMQ disabilitato (SKIP_QUEUE=true). Chiama calculate_dosage e optimize_dosage direttamente invece di delegare al sub-agente.',
        });
      }

      try {
        const wm = getWorkingMemory(threadId);
        const allUnits = (wm.inputUnits ?? []) as unknown[];
        const filteredUnits =
          input.unitIds && input.unitIds.length > 0
            ? allUnits.filter((u) => {
                const id = (u as { id?: string | number }).id;
                return id !== undefined && input.unitIds!.includes(String(id));
              })
            : allUnits;

        if (filteredUnits.length === 0) {
          return JSON.stringify({
            status: 'error',
            error: 'Nessuna unità di produzione disponibile in working memory.',
            hint: 'Esegui prima list_production_units (o passa unitIds espliciti che esistano in WM).',
          });
        }

        const queueInput: InputDosageAgent = {
          unitOfProduction: filteredUnits as InputDosageAgent['unitOfProduction'],
          products: (input.products ??
            (wm.inputProducts as unknown as InputDosageAgent['products']) ??
            []) as InputDosageAgent['products'],
          strategy: input.strategy,
        };

        const queue = getDosageSubagentQueue();
        const jobId = await queue.addJob({
          threadId,
          userId,
          task: input.task,
          input: queueInput,
        });

        return JSON.stringify({
          status: 'queued',
          subAgentJobId: jobId,
          unitCount: filteredUnits.length,
          productCount: queueInput.products.length,
          message:
            'Sub-agente schedulato. I risultati appariranno in spawnSubagentResults; controlla con get_working_memory_details dopo circa 10-30s.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[spawn_subagent] enqueue failed:', error);
        return JSON.stringify({ status: 'error', error: msg });
      }
    },
  });
}
