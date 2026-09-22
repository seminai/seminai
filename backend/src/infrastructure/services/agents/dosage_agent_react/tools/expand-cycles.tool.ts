import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { expandUnitOfProductionWithCycles } from '../../dosage_agent/productionCycleExpander';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import type { RawUnitOfProduction } from '../../dosage_agent/types';

/**
 * Tool: expand_production_cycles
 * Loads production cycles for production units from the database.
 */
export function createExpandCyclesTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'expand_production_cycles',
    description: `Carica i cicli produttivi delle unità di produzione dal database.
Necessario per ottenere le date fenologiche (semina, trapianto, raccolta) per la pianificazione dei trattamenti.
Legge le unità di produzione dalla working memory (inputUnits) o le accetta come parametro.
Salva il risultato in working memory (expandedUnits).`,
    schema: z.object({
      unitIds: z
        .array(z.string())
        .optional()
        .describe('IDs delle unità di produzione. Se omesso, usa le unità dalla working memory.'),
    }),
    func: async ({ unitIds }) => {
      try {
        const wm = getWorkingMemory(threadId);

        // Resolve units from working memory or build from IDs
        let units = (wm.inputUnits ?? []) as RawUnitOfProduction[];
        if (unitIds && unitIds.length > 0) {
          units = unitIds.map((id: string) => ({ id }));
        }

        if (units.length === 0) {
          return JSON.stringify({
            error: 'Nessuna unità di produzione disponibile.',
            hint: 'Fornire unitIds o assicurarsi che inputUnits sia presente nella working memory.',
          });
        }

        const expanded = await expandUnitOfProductionWithCycles(units);
        updateWorkingMemory(threadId, { expandedUnits: expanded });

        // Build summary for the agent
        const summary = expanded.map((unit) => {
          const value = unit as RawUnitOfProduction & {
            readonly cropName?: string;
            readonly cycles?: unknown[];
          };
          return {
            id: value.id,
            name: value.name ?? value.cropName,
            cropName: value.cropName,
            startDate: value.startDate,
            endDate: value.endDate,
            hasCycles: Boolean(value.cycles?.length),
          };
        });

        return JSON.stringify({
          unitsExpanded: expanded.length,
          summary,
          workingMemoryKey: 'expandedUnits',
          message: `${expanded.length} unità di produzione espanse con i rispettivi cicli produttivi.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
