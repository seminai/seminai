import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { flowOptimizeDosageLinearFunc } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from '../../dosage_agent/historyCollector';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';

/**
 * Tool: optimize_dosage
 * Optimizes doses using linear programming to respect stock constraints.
 */
export function createOptimizeDosageTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'optimize_dosage',
    description: `Ottimizza le dosi con programmazione lineare per rispettare i vincoli di stock disponibile.
Usa questo tool SOLO se calculate_stock_balance ha mostrato prodotti in overstock.
Scala le dosi proporzionalmente per rimanere entro lo stock disponibile senza azzerare i trattamenti.
Richiede dosageResults dalla working memory.`,
    schema: z.object({
      strategy: z
        .enum(['min', 'max', 'avg', 'current'])
        .optional()
        .default('avg')
        .describe("Strategia di dosaggio per l'ottimizzazione"),
      outStockLimiter: z
        .boolean()
        .optional()
        .default(true)
        .describe('Limita le dosi per rispettare lo stock (default: true)'),
    }),
    func: async ({ strategy, outStockLimiter }) => {
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

        const optimized = await flowOptimizeDosageLinearFunc(
          dosageResults,
          strategy ?? 'avg',
          historyManager,
          outStockLimiter ?? true,
        );

        updateWorkingMemory(threadId, { dosageResults: optimized });

        return JSON.stringify({
          unitsOptimized: optimized.length,
          strategy,
          message:
            'Dosi ottimizzate per rispettare i vincoli di stock. Rieseguire calculate_stock_balance per verificare il bilancio aggiornato.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
